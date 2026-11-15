/**
 * app/core/domain/eventArchive.js — governed, finite-horizon event archive
 * capsules (ADR-0205).
 *
 * A capsule is not a backup and is never restored into workspace state. It is
 * an explicitly encrypted file containing a closed UTC window of complete
 * sealed event blocks, one verified seal immediately before the window, and a
 * later closing seal. The anchor and every included block are checked against
 * the same Sealed Spine primitives used by the live reader.
 *
 * The capsule retains the exact six persisted event fields. That is necessary
 * for the transaction digests to recompute; it also means ids and summaries
 * may be sensitive. Files are passphrase-encrypted, scoped to the requested
 * dates, and carry a declared expiry. Physical deletion of a downloaded file
 * and trusted external time-stamping are outside this local browser's power.
 */

import {
  KDF_ITERATIONS,
  PURPOSE_EVENT_ARCHIVE,
  checkEnvelope,
  cryptoAvailable,
  deriveKey,
  newSalt,
  openEnvelope,
  sealText,
  validatePassphrase,
} from '../crypto.js';
import { IDENTITY_EVENTS } from './identityRegistry.js';
import {
  EVENT_ARCHIVE_EVENT_CAP,
  EVENT_ARCHIVE_FORMAT,
  EVENT_ARCHIVE_LIMITS,
  EVENT_ARCHIVE_PROOF_DOMAIN,
  EVENT_ARCHIVE_VERSION,
} from './eventArchiveRegistry.js';
import { activeSealKey, canonicalJson, hmacSha256Hex, sha256Hex } from './sealCrypto.js';
import { computeSeal, parseSealEvent, txDigest } from './sealChain.js';
import { SEAL_ENGINE_VERSION, SEAL_EVENTS, SEAL_GENESIS } from './sealRegistry.js';

const DAY_MS = 86_400_000;
const EVENT_FIELDS = Object.freeze(['id', 'ts', 'type', 'entity', 'entityId', 'summary']);
const EVENT_FIELD_SET = new Set(EVENT_FIELDS);
const IDENTITY_CAP_TYPES = new Set([IDENTITY_EVENTS.ATTESTED, IDENTITY_EVENTS.VERIFIED]);
const SEAL_MODES = new Set(['hash', 'hmac']);

const fail = (reason, error, extra = {}) => ({ ok: false, reason, error, ...extra });
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const hex64 = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

function validIso(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function dayBoundary(value, endOfDay = false) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const start = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== value) return null;
  return new Date(start.getTime() + (endOfDay ? DAY_MS - 1 : 0));
}

function eventIsValid(event) {
  if (!isPlainObject(event)) return false;
  const keys = Object.keys(event);
  if (keys.length !== EVENT_FIELDS.length || keys.some((key) => !EVENT_FIELD_SET.has(key))) return false;
  if (EVENT_FIELDS.some((key) => typeof event[key] !== 'string')) return false;
  if (!event.id || event.id.length > 160 || !validIso(event.ts)) return false;
  if (!event.type || event.type.length > 60 || event.entity.length > 40 || event.entityId.length > 240 || event.summary.length > 300) return false;
  return true;
}

function sealSignatureValid(parsed, key) {
  if (!parsed || !SEAL_MODES.has(parsed.mode)) return { ok: false, reason: 'malformed-seal' };
  if (parsed.mode === 'hmac' && !key) return { ok: false, reason: 'key-required' };
  const expected = computeSeal({
    prevSeal: parsed.prev,
    digest: parsed.digest,
    revision: parsed.rev,
    mode: parsed.mode,
    key: parsed.mode === 'hmac' ? key : null,
  });
  return expected === parsed.seal ? { ok: true } : { ok: false, reason: 'seal-mismatch' };
}

function parseSealBlocks(events) {
  if (!Array.isArray(events)) return fail('bad-source', 'The workspace event log is not an array.');
  if (events.length > EVENT_ARCHIVE_LIMITS.maxEvents + EVENT_ARCHIVE_LIMITS.maxBlocks + 1) {
    return fail('source-too-large', 'The retained event suffix exceeds the archive reader’s declared bound.');
  }
  const blocks = [];
  let pending = [];
  for (let position = 0; position < events.length; position += 1) {
    const event = events[position];
    if (!eventIsValid(event)) {
      return fail('malformed-event', `Event ${position + 1} is malformed; no archive window is claimed.`);
    }
    if (event.type !== SEAL_EVENTS.SEAL) {
      pending.push(event);
      continue;
    }
    const parsed = parseSealEvent(event);
    if (!parsed || !Number.isSafeInteger(parsed.rev) || parsed.rev < 1 || !Number.isSafeInteger(parsed.evCount) || parsed.evCount < 0 || !validIso(parsed.ts)) {
      return fail('malformed-seal', `Seal event ${position + 1} is malformed; no archive window is claimed.`);
    }
    const contentComplete = pending.length === parsed.evCount;
    const contentOk = contentComplete && txDigest(pending) === parsed.digest;
    blocks.push({
      position,
      events: pending,
      sealEvent: event,
      parsed,
      contentComplete,
      contentOk,
    });
    pending = [];
    if (blocks.length > EVENT_ARCHIVE_LIMITS.maxBlocks) {
      return fail('too-many-blocks', 'The retained seal count exceeds the archive reader’s declared bound.');
    }
  }
  return { ok: true, blocks, trailingEvents: pending, trailingStart: events.length - pending.length };
}

function verifyClosedBlock(block, previousSeal, previousRevision, key) {
  if (!block.contentComplete) {
    return fail('content-incomplete', `Revision ${block.parsed.rev} cannot be recomputed from the retained event rows; it may already have been evicted or changed.`);
  }
  if (!block.contentOk) {
    return fail('content-mismatch', `Revision ${block.parsed.rev} does not match its recorded transaction digest.`);
  }
  if (block.parsed.prev !== previousSeal) {
    return fail('chain-gap', `Revision ${block.parsed.rev} does not follow the included archive anchor.`);
  }
  if (block.parsed.rev <= previousRevision) {
    return fail('revision-order', `Revision ${block.parsed.rev} is not later than the previous sealed revision.`);
  }
  const signature = sealSignatureValid(block.parsed, key);
  if (!signature.ok) {
    return fail(signature.reason, signature.reason === 'key-required'
      ? `Revision ${block.parsed.rev} is HMAC-sealed. Unlock the source workspace to verify its key; the file is not certified without it.`
      : `Revision ${block.parsed.rev} does not match its recorded seal.`);
  }
  return { ok: true };
}

function sealProofOf(parsed) {
  return {
    seal: parsed.seal,
    prev: parsed.prev,
    digest: parsed.digest,
    rev: parsed.rev,
    evCount: parsed.evCount,
    mode: parsed.mode,
    ts: parsed.ts,
  };
}

/** Verify every retained seal from genesis through the chosen start anchor. */
function verifyAnchorHistory(blocks, anchorIndex, key, fromMs) {
  let previousSeal = SEAL_GENESIS;
  let previousRevision = 0;
  let previousTime = Number.NEGATIVE_INFINITY;
  const seals = [];
  const modes = new Set();
  let preAnchorPayloadIncompleteBlocksN = 0;

  for (let index = 0; index <= anchorIndex; index += 1) {
    const block = blocks[index];
    const parsed = block.parsed;
    if (parsed.prev !== previousSeal) {
      return fail('anchor-chain-gap', `The start anchor is not on a continuous seal chain: revision ${parsed.rev} points to a different predecessor.`);
    }
    if (!Number.isSafeInteger(parsed.rev) || parsed.rev <= previousRevision
        || !Number.isSafeInteger(parsed.evCount) || parsed.evCount < block.events.length) {
      return fail('anchor-revision-order', `The retained seal history is malformed at revision ${parsed.rev}; no start anchor is claimed.`);
    }
    const signature = sealSignatureValid(parsed, key);
    if (!signature.ok) {
      return fail(signature.reason, signature.reason === 'key-required'
        ? `The start-anchor chain contains an HMAC seal at revision ${parsed.rev}. Unlock the source workspace before archiving.`
        : `The retained seal history does not verify at revision ${parsed.rev}.`);
    }
    if (block.contentComplete && !block.contentOk) {
      return fail('content-mismatch', `The retained events for prior revision ${parsed.rev} do not match their seal.`);
    }
    if (index < anchorIndex && !block.contentComplete) preAnchorPayloadIncompleteBlocksN += 1;

    const sealTime = Date.parse(parsed.ts);
    if (!validIso(parsed.ts) || sealTime < previousTime || sealTime >= fromMs) {
      return fail('anchor-time-order', 'The retained seal history does not place every prior seal strictly before the requested window in UTC order.');
    }
    for (const event of block.events) {
      const eventTime = Date.parse(event.ts);
      if (eventTime < previousTime || eventTime > sealTime) {
        return fail('anchor-time-order', `A retained event before the start anchor is not ordered before its seal (revision ${parsed.rev}).`);
      }
      if (eventTime >= fromMs) {
        return fail('anchor-window-overlap', 'A retained event before the proposed start anchor falls inside or after the requested window; the boundary is ambiguous.');
      }
      previousTime = eventTime;
    }
    if (sealTime < previousTime) {
      return fail('anchor-time-order', `The seal timestamp for prior revision ${parsed.rev} precedes one of its retained events.`);
    }
    previousTime = sealTime;
    previousSeal = parsed.seal;
    previousRevision = parsed.rev;
    modes.add(parsed.mode);
    seals.push(sealProofOf(parsed));
  }

  return {
    ok: true,
    seals,
    sealModes: [...modes].sort(),
    preAnchorPayloadIncompleteBlocksN,
    anchorBlockContentComplete: Boolean(blocks[anchorIndex].contentComplete && blocks[anchorIndex].contentOk),
  };
}

/** Independently verify the minimal seal-chain proof carried before the anchor. */
function verifyAnchorProof(anchorProof, anchorParsed, source, key, fromMs) {
  if (!Array.isArray(anchorProof) || anchorProof.length < 1
      || anchorProof.length > EVENT_ARCHIVE_LIMITS.maxBlocks
      || anchorProof.length !== source.anchorChainSealsN) {
    return fail('bad-anchor-proof', 'The archive does not carry the bounded seal-chain proof needed to verify its start anchor.');
  }
  const proofKeys = ['seal', 'prev', 'digest', 'rev', 'evCount', 'mode', 'ts'];
  let previousSeal = SEAL_GENESIS;
  let previousRevision = 0;
  let previousTime = Number.NEGATIVE_INFINITY;
  const modes = new Set();
  let last = null;

  for (let index = 0; index < anchorProof.length; index += 1) {
    const seal = anchorProof[index];
    if (!exactKeys(seal, proofKeys) || !hex64(seal.seal) || !hex64(seal.prev) || !hex64(seal.digest)
        || !Number.isSafeInteger(seal.rev) || seal.rev < 1
        || !Number.isSafeInteger(seal.evCount) || seal.evCount < 0
        || !SEAL_MODES.has(seal.mode) || !validIso(seal.ts)) {
      return fail('bad-anchor-proof', `Anchor-chain seal ${index + 1} is malformed.`);
    }
    if (seal.prev !== previousSeal || seal.rev <= previousRevision) {
      return fail('anchor-chain-gap', `Anchor-chain seal ${index + 1} does not follow its predecessor in revision order.`);
    }
    const timestamp = Date.parse(seal.ts);
    if (timestamp < previousTime || timestamp >= fromMs) {
      return fail('anchor-time-order', 'The carried seal-chain proof does not end strictly before the requested UTC window.');
    }
    const signature = sealSignatureValid(seal, key);
    if (!signature.ok) {
      return fail(signature.reason, signature.reason === 'key-required'
        ? `Anchor-chain seal ${index + 1} is HMAC-sealed. Unlock the source workspace to verify the archive anchor.`
        : `Anchor-chain seal ${index + 1} does not match its recorded seal.`);
    }
    previousSeal = seal.seal;
    previousRevision = seal.rev;
    previousTime = timestamp;
    modes.add(seal.mode);
    last = seal;
  }

  if (!last || last.seal !== anchorParsed.seal || last.prev !== anchorParsed.prev
      || last.digest !== anchorParsed.digest || last.rev !== anchorParsed.rev
      || last.evCount !== anchorParsed.evCount || last.mode !== anchorParsed.mode
      || last.ts !== anchorParsed.ts) {
    return fail('bad-anchor-proof', 'The carried seal-chain proof does not terminate at the included start-anchor seal.');
  }
  const computedModes = [...modes].sort();
  if (canonicalJson(computedModes) !== canonicalJson(source.anchorProofModes)) {
    return fail('mode-mismatch', 'The declared anchor-chain seal modes do not match the carried proof.');
  }
  return { ok: true, sealModes: computedModes };
}

function archiveManifestBody(archive) {
  return {
    format: archive.format,
    version: archive.version,
    manifest: archive.manifest,
    anchor: archive.anchor,
    anchorProof: archive.anchorProof,
    blocks: archive.blocks,
  };
}

function proofSignature(algorithm, digest, key) {
  const message = `${EVENT_ARCHIVE_PROOF_DOMAIN}|${digest}`;
  return algorithm === 'HMAC-SHA-256'
    ? hmacSha256Hex(key, message)
    : sha256Hex(message);
}

function windowCounts(blocks, fromMs, throughMs) {
  let eventsN = 0;
  let windowEventsN = 0;
  for (const block of blocks) {
    const records = [...block.events, block.sealEvent];
    for (const event of records) {
      eventsN += 1;
      const ts = Date.parse(event.ts);
      if (ts >= fromMs && ts <= throughMs) windowEventsN += 1;
    }
  }
  return { blocksN: blocks.length, eventsN, windowEventsN, boundaryEventsN: eventsN - windowEventsN };
}

function retentionFields(createdAt, retainUntilDay) {
  const created = new Date(createdAt);
  const until = dayBoundary(retainUntilDay, true);
  const createdDay = created.toISOString().slice(0, 10);
  if (!until || retainUntilDay <= createdDay) return null;
  const days = Math.round((dayBoundary(retainUntilDay).getTime() - dayBoundary(createdDay).getTime()) / DAY_MS);
  if (!Number.isInteger(days) || days < 1 || days > EVENT_ARCHIVE_LIMITS.maxRetentionDays) return null;
  return { retainUntil: until.toISOString(), retentionDays: days };
}

/**
 * Aggregate status for the UI. It does not return event bodies, names, ids or
 * summaries. `EVENT_ARCHIVE_EVENT_CAP` is also the exact cap used by store.js.
 */
export function eventArchiveStatus(state = {}, {
  now = new Date(), canCreate = true, reason = null,
} = {}) {
  const events = Array.isArray(state.events) ? state.events : [];
  const ordinary = events.filter((event) => event
    && event.type !== SEAL_EVENTS.SEAL
    && !IDENTITY_CAP_TYPES.has(event.type));
  const sortedTimes = ordinary.map((event) => event && event.ts).filter((value) => validIso(value)).sort();
  const sealEventsN = events.filter((event) => event?.type === SEAL_EVENTS.SEAL).length;
  const identityEventsN = events.filter((event) => IDENTITY_CAP_TYPES.has(event?.type)).length;
  const n = events.length - sealEventsN - identityEventsN;
  const pressure = n >= EVENT_ARCHIVE_EVENT_CAP
    ? 'at-cap'
    : n >= EVENT_ARCHIVE_LIMITS.warnAt ? 'approaching-cap' : 'below-warning';
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const parsed = parseSealBlocks(events);
  const validBlockN = parsed.ok ? parsed.blocks.filter((block) => block.contentComplete && block.contentOk).length : 0;
  const modes = parsed.ok ? [...new Set(parsed.blocks.map((block) => block.parsed.mode))].sort() : [];
  return {
    eventCap: EVENT_ARCHIVE_EVENT_CAP,
    ordinaryEventsN: n,
    pressure,
    oldestRetainedEventAt: sortedTimes[0] || null,
    newestRetainedEventAt: sortedTimes.at(-1) || null,
    sealsN: sealEventsN,
    contentCompleteBlocksN: validBlockN,
    sealModes: modes,
    eventLogShape: parsed.ok ? 'readable' : 'refused',
    eventLogReason: parsed.ok ? null : parsed.error,
    now: Number.isFinite(at.getTime()) ? at.toISOString() : null,
    canCreate: canCreate === true,
    createRefusal: canCreate === true ? null : (reason || 'Archive creation is available only from a writable full-access operator view.'),
    storagePolicy: 'encrypted external file only; no in-app event copy',
  };
}

/**
 * Build an encrypted-archive payload from the presently retained, sealed log.
 * A caller must supply UTC day keys and a declared purpose/retention date.
 * Every data block between the start anchor and closing seal must recompute in
 * full, and the chain segment must be continuous. No live event is altered.
 */
export function createEventArchive(state = {}, input = {}, {
  now = new Date(), key = activeSealKey(),
} = {}) {
  if (!isPlainObject(input)) return fail('bad-request', 'Provide an archive request object.');
  const at = now instanceof Date ? now : new Date(now || Date.now());
  if (!Number.isFinite(at.getTime())) return fail('bad-clock', 'The archive clock is invalid; no retention horizon can be declared.');
  const createdAt = at.toISOString();
  const fromStart = dayBoundary(input.fromDay);
  const throughEnd = dayBoundary(input.throughDay, true);
  if (!fromStart || !throughEnd) return fail('bad-window', 'Choose valid UTC start and end dates for the closed archive window.');
  if (throughEnd.getTime() < fromStart.getTime()) return fail('bad-window', 'The archive end date is before its start date. Nothing was changed.');
  if (throughEnd.getTime() >= at.getTime()) return fail('window-open', 'Only a fully closed UTC window can be archived. The end date must be before the current UTC day.');
  const windowDays = Math.floor((throughEnd.getTime() - fromStart.getTime()) / DAY_MS) + 1;
  if (windowDays > EVENT_ARCHIVE_LIMITS.maxWindowDays) return fail('window-too-large', `The declared window exceeds ${EVENT_ARCHIVE_LIMITS.maxWindowDays} days.`);

  const purpose = typeof input.purpose === 'string' ? input.purpose.trim() : '';
  if (purpose.length < EVENT_ARCHIVE_LIMITS.purposeMin || purpose.length > EVENT_ARCHIVE_LIMITS.purposeMax || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(purpose)) {
    return fail('purpose-required', `State a single-line archive purpose (${EVENT_ARCHIVE_LIMITS.purposeMin}–${EVENT_ARCHIVE_LIMITS.purposeMax} characters).`);
  }
  const retention = retentionFields(createdAt, input.retainUntilDay);
  if (!retention) return fail('bad-retention', `Choose a retain-until UTC date after today and no more than ${EVENT_ARCHIVE_LIMITS.maxRetentionDays} days from creation.`);

  const parsedLog = parseSealBlocks(state.events);
  if (!parsedLog.ok) return parsedLog;
  const { blocks, trailingEvents, trailingStart } = parsedLog;
  const fromMs = fromStart.getTime();
  const throughMs = throughEnd.getTime();
  const anchorIndex = blocks.reduce((found, block, index) => (Date.parse(block.parsed.ts) < fromMs ? index : found), -1);
  if (anchorIndex < 0) {
    return fail('anchor-missing', 'No retained seal strictly precedes the window. An archive cannot start from an invented or backfilled anchor.');
  }
  const anchorBlock = blocks[anchorIndex];
  const anchorHistory = verifyAnchorHistory(blocks, anchorIndex, key, fromMs);
  if (!anchorHistory.ok) return anchorHistory;
  let closingIndex = -1;
  for (let i = anchorIndex + 1; i < blocks.length; i += 1) {
    if (Date.parse(blocks[i].parsed.ts) > throughMs) { closingIndex = i; break; }
  }
  if (closingIndex < 0) {
    return fail('closing-seal-missing', 'No seal closes the selected window after its end. Run “Seal + verify” after the period closes, then create the archive.');
  }
  const closingBlock = blocks[closingIndex];
  const includedSourceBlocks = blocks.slice(anchorIndex + 1, closingIndex + 1);
  if (!includedSourceBlocks.length) return fail('empty-segment', 'No sealed block spans the selected window.');
  if (includedSourceBlocks.length > EVENT_ARCHIVE_LIMITS.maxBlocks) return fail('too-many-blocks', 'The selected window exceeds the archive block limit.');

  let previousSeal = anchorBlock.parsed.seal;
  let previousRevision = anchorBlock.parsed.rev;
  let previousTime = Date.parse(anchorBlock.parsed.ts);
  const includedBlocks = [];
  const seenEventIds = new Set();
  for (const block of includedSourceBlocks) {
    const checked = verifyClosedBlock(block, previousSeal, previousRevision, key);
    if (!checked.ok) return checked;
    for (const event of block.events) {
      const ts = Date.parse(event.ts);
      if (ts < previousTime || ts > Date.parse(block.parsed.ts)) {
        return fail('timestamp-order', 'The event timestamps are not ordered within this sealed segment; date-window coverage is refused.');
      }
      if (seenEventIds.has(event.id)) return fail('duplicate-event-id', 'A duplicate event id appears inside the selected archive window.');
      seenEventIds.add(event.id);
      previousTime = ts;
    }
    const sealTime = Date.parse(block.parsed.ts);
    if (sealTime < previousTime) return fail('timestamp-order', 'The seal timestamp precedes an event it closes. Date-window coverage is refused.');
    if (seenEventIds.has(block.sealEvent.id)) return fail('duplicate-event-id', 'A duplicate event id appears inside the selected archive window.');
    seenEventIds.add(block.sealEvent.id);
    previousTime = sealTime;
    includedBlocks.push({ events: block.events.map((event) => ({ ...event })), seal: { ...block.sealEvent } });
    previousSeal = block.parsed.seal;
    previousRevision = block.parsed.rev;
  }
  if (Date.parse(closingBlock.parsed.ts) <= throughMs) return fail('closing-seal-missing', 'The closing seal is not strictly after the requested window.');

  // Any event after the close must also be after the requested period. A
  // same-instant post-close act is not ordered by timestamps and therefore
  // cannot be silently treated as outside the window.
  let suffixTime = Date.parse(closingBlock.parsed.ts);
  const allEvents = state.events;
  for (let i = closingBlock.position + 1; i < allEvents.length; i += 1) {
    const event = allEvents[i];
    if (!eventIsValid(event)) return fail('malformed-suffix', 'The retained log suffix after the closing seal is malformed.');
    const ts = Date.parse(event.ts);
    if (ts <= throughMs || ts < suffixTime) {
      return fail('unsealed-in-window', 'An event after the closing seal shares or precedes the requested end instant; complete window coverage is refused.');
    }
    suffixTime = ts;
  }
  // `trailingStart` is deliberately read: a trailing, unsealed event inside the
  // period would otherwise be omitted. The suffix loop above checks all rows
  // after the closing seal, including an unsealed tail.
  void trailingEvents;
  void trailingStart;

  const anchor = { ...anchorBlock.sealEvent };
  const archiveBlocks = includedBlocks;
  const counts = windowCounts(archiveBlocks.map((block) => ({ events: block.events, sealEvent: block.seal })), fromMs, throughMs);
  if (counts.eventsN > EVENT_ARCHIVE_LIMITS.maxEvents) return fail('too-many-events', 'The selected event window exceeds the archive event limit.');
  const modes = [...new Set([anchorBlock.parsed.mode, ...includedSourceBlocks.map((block) => block.parsed.mode)])].sort();
  const hasHmac = modes.includes('hmac');
  if (hasHmac && !key) return fail('key-required', 'The selected seal segment contains HMAC blocks. Unlock the source workspace before creating its archive.');

  const manifest = {
    createdAt,
    retainUntil: retention.retainUntil,
    retentionDays: retention.retentionDays,
    purpose,
    window: {
      fromDay: input.fromDay,
      throughDay: input.throughDay,
      fromAt: fromStart.toISOString(),
      throughAt: throughEnd.toISOString(),
    },
    source: {
      schemaVersion: Number(state.schemaVersion) || null,
      sealEngineVersion: SEAL_ENGINE_VERSION,
      anchorSeal: anchorBlock.parsed.seal,
      anchorChainSealsN: anchorHistory.seals.length,
      anchorProofModes: anchorHistory.sealModes,
      preAnchorPayloadIncompleteBlocksN: anchorHistory.preAnchorPayloadIncompleteBlocksN,
      anchorBlockContentComplete: anchorHistory.anchorBlockContentComplete,
      closingSeal: closingBlock.parsed.seal,
      snapshotRevision: closingBlock.parsed.rev,
      sealModes: modes,
      timestampBasis: 'workspace event timestamps in UTC; not an external trusted timestamp',
    },
    counts,
    storage: 'encrypted external file only; no in-app event copy; never restored to live state',
  };
  const body = {
    format: EVENT_ARCHIVE_FORMAT,
    version: EVENT_ARCHIVE_VERSION,
    manifest,
    anchor,
    anchorProof: anchorHistory.seals,
    blocks: archiveBlocks,
  };
  const digest = sha256Hex(canonicalJson(body));
  const algorithm = key ? 'HMAC-SHA-256' : 'SHA-256';
  const signature = proofSignature(algorithm, digest, key);
  const archiveId = `lpa1-${signature.slice(0, 24)}`;
  const archive = {
    ...body,
    archiveId,
    proof: { algorithm, digest, signature },
  };
  return {
    ok: true,
    archive,
    summary: {
      archiveId,
      fromDay: input.fromDay,
      throughDay: input.throughDay,
      retainUntil: retention.retainUntil,
      retentionDays: retention.retentionDays,
      blocksN: archiveBlocks.length,
      anchorChainSealsN: anchorHistory.seals.length,
      preAnchorPayloadIncompleteBlocksN: anchorHistory.preAnchorPayloadIncompleteBlocksN,
      anchorBlockContentComplete: anchorHistory.anchorBlockContentComplete,
      ...counts,
      sealModes: modes,
      manifestAlgorithm: algorithm,
      keyed: algorithm === 'HMAC-SHA-256',
    },
  };
}

function exactKeys(object, expected) {
  if (!isPlainObject(object)) return false;
  const actual = Object.keys(object).sort();
  const wanted = expected.slice().sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function verifiedReport(archive, { expired = false, targetWindow = null, targetCovered = null } = {}) {
  const m = archive.manifest;
  const sealModes = m.source.sealModes;
  const keyedBlocksN = sealModes.includes('hmac');
  return {
    verdict: expired ? 'expired' : 'verified',
    archiveId: archive.archiveId,
    createdAt: m.createdAt,
    retainUntil: m.retainUntil,
    retentionDays: m.retentionDays,
    purpose: m.purpose,
    window: { ...m.window },
    blocksN: m.counts.blocksN,
    eventsN: m.counts.eventsN,
    windowEventsN: m.counts.windowEventsN,
    boundaryEventsN: m.counts.boundaryEventsN,
    sealModes: sealModes.slice(),
    anchorProof: {
      verdict: 'verified from genesis through the included start anchor',
      sealsN: m.source.anchorChainSealsN,
      sealModes: m.source.anchorProofModes.slice(),
      preAnchorPayloadIncompleteBlocksN: m.source.preAnchorPayloadIncompleteBlocksN,
      anchorBlockContentComplete: m.source.anchorBlockContentComplete,
      contentNote: `${m.source.preAnchorPayloadIncompleteBlocksN} earlier transaction payload(s) before the anchor were incomplete in the source log; the seal chain still verifies, and those payloads are outside the archived window. ${m.source.anchorBlockContentComplete ? 'The anchor transaction itself was complete when archived.' : 'The anchor transaction payload was also incomplete when archived.'}`,
    },
    manifestProof: archive.proof.algorithm === 'HMAC-SHA-256' ? 'HMAC-SHA-256 verified' : 'SHA-256 verified; forgeable by a writer who can rewrite the file',
    segmentProof: keyedBlocksN ? 'HMAC seal(s) verified with the source workspace key' : 'plain-hash seal segment verified; tamper-evident, not forgery-proof',
    sourceRevision: m.source.snapshotRevision,
    sourceSchemaVersion: m.source.schemaVersion,
    timestampBasis: m.source.timestampBasis,
    targetWindow,
    targetCoverage: targetWindow ? {
      verdict: targetCovered ? 'covered' : 'outside-archive-window',
      reason: targetCovered
        ? 'The verified archive interval encloses the requested UTC window.'
        : 'The requested UTC window extends beyond the archive’s declared verified interval.',
    } : { verdict: 'not-requested', reason: 'No comparison window was requested.' },
    dataReturned: false,
    restoredToWorkspace: false,
    expiryEnforced: expired ? 'use refused by verifier; physical deletion of the external file is not enforced' : 'declared by file; external deletion remains the custodian’s duty',
  };
}

/**
 * Verify a decrypted capsule object without mutating any state. On success it
 * returns aggregate proof metadata only; raw event rows are never returned to
 * the UI or admitted into the live workspace by this module.
 */
export function verifyEventArchive(archive, {
  now = new Date(), key = activeSealKey(), coverageFromDay = null, coverageThroughDay = null,
} = {}) {
  const topKeys = ['format', 'version', 'archiveId', 'manifest', 'anchor', 'anchorProof', 'blocks', 'proof'];
  if (!exactKeys(archive, topKeys)) return fail('bad-archive-shape', 'The file is not a supported LeadOS provenance archive.');
  if (archive.format !== EVENT_ARCHIVE_FORMAT || archive.version !== EVENT_ARCHIVE_VERSION) {
    return fail('unsupported-version', `This archive format is not supported (format ${String(archive.format)}, version ${String(archive.version)}).`);
  }
  const manifestKeys = ['createdAt', 'retainUntil', 'retentionDays', 'purpose', 'window', 'source', 'counts', 'storage'];
  if (!exactKeys(archive.manifest, manifestKeys)) return fail('bad-manifest', 'The archive manifest is incomplete or contains unsupported fields.');
  const { manifest } = archive;
  if (!validIso(manifest.createdAt) || !validIso(manifest.retainUntil) || !isPlainObject(manifest.window)
      || !isPlainObject(manifest.source) || !isPlainObject(manifest.counts)) {
    return fail('bad-manifest', 'The archive dates or manifest sections are malformed.');
  }
  const windowKeys = ['fromDay', 'throughDay', 'fromAt', 'throughAt'];
  const sourceKeys = ['schemaVersion', 'sealEngineVersion', 'anchorSeal', 'anchorChainSealsN', 'anchorProofModes', 'preAnchorPayloadIncompleteBlocksN', 'anchorBlockContentComplete', 'closingSeal', 'snapshotRevision', 'sealModes', 'timestampBasis'];
  const countKeys = ['blocksN', 'eventsN', 'windowEventsN', 'boundaryEventsN'];
  if (!exactKeys(manifest.window, windowKeys) || !exactKeys(manifest.source, sourceKeys) || !exactKeys(manifest.counts, countKeys)) {
    return fail('bad-manifest', 'The archive window, source proof or count identity is malformed.');
  }
  if (manifest.storage !== 'encrypted external file only; no in-app event copy; never restored to live state') {
    return fail('bad-storage-policy', 'The archive does not declare the supported external-file-only, no-restore policy.');
  }
  const from = dayBoundary(manifest.window.fromDay);
  const through = dayBoundary(manifest.window.throughDay, true);
  if (!from || !through || !validIso(manifest.window.fromAt) || !validIso(manifest.window.throughAt)
      || manifest.window.fromAt !== from.toISOString() || manifest.window.throughAt !== through.toISOString()
      || through.getTime() < from.getTime() || through.getTime() >= Date.parse(manifest.createdAt)) {
    return fail('bad-window', 'The archive does not describe a valid, closed UTC date window.');
  }
  const windowDays = Math.floor((through.getTime() - from.getTime()) / DAY_MS) + 1;
  if (windowDays > EVENT_ARCHIVE_LIMITS.maxWindowDays) return fail('window-too-large', 'The archive window exceeds the supported finite horizon.');
  if (typeof manifest.purpose !== 'string' || manifest.purpose.trim() !== manifest.purpose
      || manifest.purpose.length < EVENT_ARCHIVE_LIMITS.purposeMin || manifest.purpose.length > EVENT_ARCHIVE_LIMITS.purposeMax
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(manifest.purpose)) {
    return fail('bad-purpose', 'The archive purpose is missing or malformed.');
  }
  const retention = retentionFields(manifest.createdAt, manifest.retainUntil.slice(0, 10));
  if (!retention || retention.retainUntil !== manifest.retainUntil || retention.retentionDays !== manifest.retentionDays) {
    return fail('bad-retention', 'The declared retention horizon is invalid or exceeds the supported limit.');
  }
  if (!Number.isInteger(manifest.source.schemaVersion) || manifest.source.schemaVersion < 1
      || manifest.source.sealEngineVersion !== SEAL_ENGINE_VERSION
      || !hex64(manifest.source.anchorSeal) || !hex64(manifest.source.closingSeal)
      || !Number.isSafeInteger(manifest.source.anchorChainSealsN) || manifest.source.anchorChainSealsN < 1
      || manifest.source.anchorChainSealsN > EVENT_ARCHIVE_LIMITS.maxBlocks
      || !Array.isArray(manifest.source.anchorProofModes) || manifest.source.anchorProofModes.some((mode) => !SEAL_MODES.has(mode))
      || !Number.isSafeInteger(manifest.source.preAnchorPayloadIncompleteBlocksN) || manifest.source.preAnchorPayloadIncompleteBlocksN < 0
      || manifest.source.preAnchorPayloadIncompleteBlocksN >= manifest.source.anchorChainSealsN
      || typeof manifest.source.anchorBlockContentComplete !== 'boolean'
      || !Number.isSafeInteger(manifest.source.snapshotRevision) || manifest.source.snapshotRevision < 1
      || !Array.isArray(manifest.source.sealModes) || manifest.source.sealModes.some((mode) => !SEAL_MODES.has(mode))
      || manifest.source.timestampBasis !== 'workspace event timestamps in UTC; not an external trusted timestamp') {
    return fail('bad-source-proof', 'The source seal metadata is malformed or uses an unsupported engine.');
  }
  if (!Number.isSafeInteger(manifest.counts.blocksN) || manifest.counts.blocksN < 1
      || manifest.counts.blocksN > EVENT_ARCHIVE_LIMITS.maxBlocks
      || !Number.isSafeInteger(manifest.counts.eventsN) || manifest.counts.eventsN < 0
      || !Number.isSafeInteger(manifest.counts.windowEventsN) || manifest.counts.windowEventsN < 0
      || !Number.isSafeInteger(manifest.counts.boundaryEventsN) || manifest.counts.boundaryEventsN < 0
      || manifest.counts.eventsN > EVENT_ARCHIVE_LIMITS.maxEvents
      || manifest.counts.windowEventsN + manifest.counts.boundaryEventsN !== manifest.counts.eventsN) {
    return fail('count-mismatch', 'The archive’s printed event counts do not reconcile.');
  }
  if (!exactKeys(archive.proof, ['algorithm', 'digest', 'signature'])
      || !['SHA-256', 'HMAC-SHA-256'].includes(archive.proof.algorithm)
      || !hex64(archive.proof.digest) || !hex64(archive.proof.signature)
      || typeof archive.archiveId !== 'string' || !/^lpa1-[0-9a-f]{24}$/.test(archive.archiveId)) {
    return fail('bad-proof', 'The archive commitment is malformed.');
  }
  if (!eventIsValid(archive.anchor) || archive.anchor.type !== SEAL_EVENTS.SEAL || !Array.isArray(archive.blocks)
      || archive.blocks.length < 1 || archive.blocks.length > EVENT_ARCHIVE_LIMITS.maxBlocks
      || archive.blocks.length !== manifest.counts.blocksN) {
    return fail('bad-blocks', 'The archive has no valid start anchor or its sealed block list is out of bounds.');
  }
  const anchorParsed = parseSealEvent(archive.anchor);
  if (!anchorParsed || anchorParsed.seal !== manifest.source.anchorSeal
      || !Number.isSafeInteger(anchorParsed.rev) || anchorParsed.rev < 1
      || !Number.isSafeInteger(anchorParsed.evCount) || anchorParsed.evCount < 0
      || Date.parse(anchorParsed.ts) >= from.getTime()) {
    return fail('bad-anchor', 'The start anchor is not a valid seal strictly before the declared window.');
  }
  const anchorProofCheck = verifyAnchorProof(archive.anchorProof, anchorParsed, manifest.source, key, from.getTime());
  if (!anchorProofCheck.ok) return anchorProofCheck;

  let head = anchorParsed.seal;
  let revision = anchorParsed.rev;
  let previousTime = Date.parse(anchorParsed.ts);
  const modes = new Set([anchorParsed.mode]);
  const rebuilt = [];
  const seenIds = new Set([archive.anchor.id]);
  let flatEventsN = 0;
  for (let blockIndex = 0; blockIndex < archive.blocks.length; blockIndex += 1) {
    const rawBlock = archive.blocks[blockIndex];
    if (!exactKeys(rawBlock, ['events', 'seal']) || !Array.isArray(rawBlock.events) || !eventIsValid(rawBlock.seal) || rawBlock.seal.type !== SEAL_EVENTS.SEAL) {
      return fail('bad-block', `Archive block ${blockIndex + 1} is malformed.`);
    }
    const parsed = parseSealEvent(rawBlock.seal);
    if (!parsed || !Number.isSafeInteger(parsed.rev) || parsed.rev < 1
        || !Number.isSafeInteger(parsed.evCount) || parsed.evCount < 0 || parsed.evCount !== rawBlock.events.length) {
      return fail('bad-block', `Archive block ${blockIndex + 1} has an invalid seal or event count.`);
    }
    for (const event of rawBlock.events) {
      if (!eventIsValid(event) || event.type === SEAL_EVENTS.SEAL) return fail('bad-event', `Archive block ${blockIndex + 1} contains a malformed or nested seal event.`);
      if (seenIds.has(event.id)) return fail('duplicate-event-id', 'The archive contains a duplicate event id.');
      seenIds.add(event.id);
      const timestamp = Date.parse(event.ts);
      if (timestamp < previousTime || timestamp > Date.parse(parsed.ts)) return fail('timestamp-order', 'Event order or seal timing is inconsistent; date-window coverage is refused.');
      previousTime = timestamp;
    }
    const sealTimestamp = Date.parse(parsed.ts);
    if (!validIso(parsed.ts) || sealTimestamp < previousTime || seenIds.has(rawBlock.seal.id)) {
      return fail('timestamp-order', `Archive seal ${blockIndex + 1} does not follow its events in UTC order.`);
    }
    seenIds.add(rawBlock.seal.id);
    previousTime = sealTimestamp;
    const synthetic = { events: rawBlock.events, parsed, contentComplete: true, contentOk: txDigest(rawBlock.events) === parsed.digest };
    const checked = verifyClosedBlock(synthetic, head, revision, key);
    if (!checked.ok) return checked;
    modes.add(parsed.mode);
    flatEventsN += rawBlock.events.length + 1;
    rebuilt.push({ events: rawBlock.events, sealEvent: rawBlock.seal });
    head = parsed.seal;
    revision = parsed.rev;
  }
  if (head !== manifest.source.closingSeal || revision !== manifest.source.snapshotRevision) {
    return fail('closing-head-mismatch', 'The archived block chain does not reach the declared closing seal and revision.');
  }
  const lastSeal = parseSealEvent(archive.blocks.at(-1).seal);
  if (!lastSeal || Date.parse(lastSeal.ts) <= through.getTime()) {
    return fail('closing-seal-missing', 'The archive has no closing seal strictly after its declared window.');
  }
  const computedModes = [...modes].sort();
  if (canonicalJson(computedModes) !== canonicalJson(manifest.source.sealModes)) {
    return fail('mode-mismatch', 'The listed seal modes do not match the archived blocks.');
  }
  const counts = windowCounts(rebuilt, from.getTime(), through.getTime());
  if (counts.eventsN !== flatEventsN || canonicalJson(counts) !== canonicalJson(manifest.counts)) {
    return fail('count-mismatch', 'The archived event rows do not reproduce the manifest counts.');
  }

  const body = archiveManifestBody(archive);
  const digest = sha256Hex(canonicalJson(body));
  if (digest !== archive.proof.digest) return fail('archive-digest-mismatch', 'The archive contents or manifest changed after the capsule was created.');
  if (archive.proof.algorithm === 'HMAC-SHA-256' && !key) {
    return fail('key-required', 'The archive manifest is HMAC-authenticated. Unlock the source workspace to verify the archive commitment.');
  }
  const expectedSignature = proofSignature(archive.proof.algorithm, digest, key);
  if (expectedSignature !== archive.proof.signature || archive.archiveId !== `lpa1-${expectedSignature.slice(0, 24)}`) {
    return fail('archive-signature-mismatch', 'The archive commitment does not verify. No coverage claim is made.');
  }

  const at = now instanceof Date ? now : new Date(now || Date.now());
  if (!Number.isFinite(at.getTime())) return fail('bad-clock', 'The verification clock is invalid; archive expiry cannot be assessed.');
  const expired = at.getTime() > Date.parse(manifest.retainUntil);
  let targetWindow = null;
  let targetCovered = null;
  const hasTargetFrom = Boolean(coverageFromDay);
  const hasTargetThrough = Boolean(coverageThroughDay);
  if (hasTargetFrom !== hasTargetThrough) return fail('bad-target-window', 'Choose both dates, or neither, for an archive coverage comparison.');
  if (hasTargetFrom) {
    const targetFrom = dayBoundary(coverageFromDay);
    const targetThrough = dayBoundary(coverageThroughDay, true);
    if (!targetFrom || !targetThrough || targetThrough.getTime() < targetFrom.getTime()) {
      return fail('bad-target-window', 'The requested coverage comparison is not a valid UTC date window.');
    }
    targetWindow = { fromDay: coverageFromDay, throughDay: coverageThroughDay, fromAt: targetFrom.toISOString(), throughAt: targetThrough.toISOString() };
    targetCovered = !expired && from.getTime() <= targetFrom.getTime() && through.getTime() >= targetThrough.getTime();
  }
  return {
    ok: true,
    report: verifiedReport(archive, { expired, targetWindow, targetCovered }),
  };
}

/** Encrypt a just-built archive with a new, archive-only passphrase. */
export async function encryptEventArchive(archive, {
  passphrase = '', confirmPassphrase = '', cryptoRef = undefined,
} = {}) {
  if (typeof passphrase !== 'string' || passphrase !== confirmPassphrase) {
    return fail('passphrase-mismatch', 'The archive passphrases do not match.');
  }
  const policy = validatePassphrase(passphrase);
  if (!policy.ok) return fail('weak-passphrase', policy.error, { field: 'passphrase' });
  if (!cryptoAvailable(cryptoRef)) return fail('no-crypto', 'This browser cannot encrypt the archive. No file was created.');
  try {
    const plaintext = JSON.stringify(archive);
    if (plaintext.length > EVENT_ARCHIVE_LIMITS.maxFileChars) return fail('archive-too-large', 'The encrypted archive would exceed the declared file-size limit. Narrow the date window.');
    const salt = newSalt(cryptoRef);
    const key = await deriveKey({ passphrase, salt, iterations: KDF_ITERATIONS, cryptoRef });
    const envelope = await sealText({
      text: plaintext,
      key,
      cryptoRef,
      salt,
      iterations: KDF_ITERATIONS,
      purpose: PURPOSE_EVENT_ARCHIVE,
      createdAt: archive.manifest.createdAt,
    });
    const json = JSON.stringify(envelope, null, 2);
    if (json.length > EVENT_ARCHIVE_LIMITS.maxFileChars) return fail('archive-too-large', 'The encrypted archive would exceed the declared file-size limit. Narrow the date window.');
    return { ok: true, json, bytes: json.length };
  } catch (error) {
    return fail('encryption-failed', `Could not encrypt the archive: ${error?.message || error}`);
  }
}

/**
 * Decrypt and verify a user-selected archive file. The original JSON string and
 * all event rows remain transient; only aggregate proof metadata is returned.
 */
export async function openAndVerifyEventArchive(text, {
  passphrase = '', cryptoRef = undefined, now = new Date(), key = activeSealKey(),
  coverageFromDay = null, coverageThroughDay = null,
} = {}) {
  if (typeof text !== 'string' || text.length < 2 || text.length > EVENT_ARCHIVE_LIMITS.maxFileChars) {
    return fail('file-size', `Choose an encrypted archive file no larger than ${EVENT_ARCHIVE_LIMITS.maxFileChars.toLocaleString()} characters.`);
  }
  let envelope;
  try { envelope = JSON.parse(text); } catch { return fail('bad-json', 'The selected archive is not valid JSON.'); }
  const checked = checkEnvelope(envelope);
  if (!checked.ok) return fail(checked.reason, checked.error);
  if (envelope.purpose !== PURPOSE_EVENT_ARCHIVE) return fail('wrong-purpose', 'This encrypted file is not a LeadOS event archive. A workspace backup is never treated as an archive.');
  if (typeof passphrase !== 'string' || !passphrase) return fail('passphrase-required', 'Enter the archive passphrase.');
  const opened = await openEnvelope({ envelope, passphrase, cryptoRef });
  if (!opened.ok) return fail(opened.reason, opened.error);
  let archive;
  try { archive = JSON.parse(opened.text); } catch { return fail('bad-archive-json', 'The decrypted archive contents are not valid JSON.'); }
  return verifyEventArchive(archive, { now, key, coverageFromDay, coverageThroughDay });
}
