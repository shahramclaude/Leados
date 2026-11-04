/**
 * app/core/domain/sealChain.js — the Sealed Spine's pure engine (ADR-0082).
 *
 * A hash chain over the append-only event log. One `audit.seal` event closes
 * each sealed transaction and commits to:
 *   seal = H( "seal" | prevSeal | txDigest | revision )
 * where txDigest = SHA-256 over the canonical form of every event appended in
 * that transaction (mutator + action audit entry + every other rule's derived
 * events — so ONE seal covers the whole cross-module propagation of the
 * transaction), and H is HMAC-SHA256 when a session key is registered (vault
 * unlocked) or plain SHA-256 otherwise.
 *
 * The seal event itself fits the fixed event shape (schema v87 unchanged):
 * entityId carries the 64-hex seal, the summary carries the human-readable
 * chain fields. `verifySealChain` replays from genesis and reports the FIRST
 * break, distinguishing:
 *   - content mismatch  — a sealed block's events no longer hash to the
 *     recorded digest (someone edited an event inside a sealed block);
 *   - chain break       — a seal does not follow from its predecessor, or a
 *     seal event's own fields are not self-consistent (someone edited a seal);
 *   - evicted block     — the event-log retention cap dropped events a block
 *     recorded, so that block's content can no longer be recomputed (the seal
 *     chain itself is still verified block-to-block). Reported honestly,
 *     never silently skipped.
 *
 * Pure module: no storage, no clock beyond injected `now`, no DOM, no network.
 */

import { canonicalJson, sha256Hex, hmacSha256Hex, activeSealKey } from './sealCrypto.js';
import {
  SEAL_ENGINE_VERSION, SEAL_EVENTS, SEAL_GENESIS, SEAL_LIMITS, SEAL_TRIGGER_PREFIX,
} from './sealRegistry.js';
import { buildChain, harvestWork } from './chain.js';
import { buildSeats, activeSeat } from './seat.js';
import { isOperationalCommit } from './seatRules.js';
import { altitudeByKey, altitudeRank } from './chainRegistry.js';
import { dayKey } from '../time.js';

/* ------------------------------------------------------------- primitives */

/** Canonical form of one event: exactly the persisted fields, key-sorted. */
export function canonicalEvent(event) {
  if (!event || typeof event !== 'object') return 'null';
  return canonicalJson({
    id: String(event.id || ''),
    ts: String(event.ts || ''),
    type: String(event.type || ''),
    entity: String(event.entity || ''),
    entityId: String(event.entityId || ''),
    summary: String(event.summary || ''),
  });
}

/** Digest of a block of events appended in one transaction. */
export function txDigest(events) {
  return sha256Hex((events || []).map(canonicalEvent).join('\n'));
}

/** The seal of one transaction. `mode` is 'hmac' (keyed) or 'hash'. */
export function computeSeal({ prevSeal, digest, revision, mode, key = null }) {
  const input = `seal|${prevSeal || SEAL_GENESIS}|${digest}|${revision}`;
  return mode === 'hmac' && key
    ? hmacSha256Hex(key, input)
    : sha256Hex(input);
}

const SEAL_SUMMARY_RE = /prev=([0-9a-f]{16,64}) digest=([0-9a-f]{16,64}) rev=(\d+) ev=(\d+) mode=(\w+)(?: root=(\S*))?/;

/** Parse an `audit.seal` event back into its chain fields. */
export function parseSealEvent(event) {
  if (!event || event.type !== SEAL_EVENTS.SEAL) return null;
  const seal = String(event.entityId || '');
  const m = SEAL_SUMMARY_RE.exec(String(event.summary || ''));
  if (!m || !/^[0-9a-f]{64}$/.test(seal)) return null;
  const prev = m[1].length === 64 ? m[1] : m[1].padEnd(64, '0');
  const digest = m[2].length === 64 ? m[2] : m[2].padEnd(64, '0');
  return {
    seal,
    prev,
    prevPrefix: m[1].slice(0, 16),
    digest,
    digestPrefix: m[2].slice(0, 16),
    rev: Number(m[3]),
    evCount: Number(m[4]),
    mode: m[5],
    root: m[6] || '',
    ts: event.ts || null,
  };
}

/** The last seal event in the log, with its parsed fields. */
export function lastSealEvent(state) {
  const events = Array.isArray(state?.events) ? state.events : [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const parsed = parseSealEvent(events[i]);
    if (parsed) return { event: events[i], parsed };
  }
  return null;
}

/** Resolve the active seal mode: keyed HMAC when a session key exists. */
export function sealModeFor(settings) {
  const key = activeSealKey();
  const forcedHash = settings && settings.sealMode === 'hash';
  if (key && !forcedHash) return { mode: 'hmac', key, keyed: true };
  return { mode: 'hash', key: null, keyed: false };
}

/**
 * Should this committed transaction be sealed? Automatic pass: sealing
 * enabled + not paused + an operational (non-derived) commit. Explicit pass:
 * any `seal.*` event always seals its own transaction — a human asking to
 * verify now is never silently skipped.
 */
export function shouldSeal(event, settings) {
  const type = String(event?.type || '');
  if (type.startsWith(SEAL_TRIGGER_PREFIX)) return true;
  if (!settings || settings.sealEnabled !== true) return false;
  if (settings.sealAutoPropagate === false) return false;
  return isOperationalCommit(event);
}

/* ------------------------------------------------------------ verification */

/**
 * Replay the whole chain from genesis. Pure; safe to run on any workspace.
 */
export function verifySealChain(state, { key = activeSealKey() } = {}) {
  const events = Array.isArray(state?.events) ? state.events : [];
  const blocks = [];
  const breaks = [];
  let runningPrev = SEAL_GENESIS;
  let sealedEvents = 0;
  let buffer = [];
  let leadingUnsealed = 0;
  let sawSeal = false;
  let evictedBlocks = 0;
  const modes = new Set();

  events.forEach((event, index) => {
    const parsed = parseSealEvent(event);
    if (!parsed) {
      if (!sawSeal) leadingUnsealed += 1;
      buffer.push(event);
      return;
    }
    sawSeal = true;
    modes.add(parsed.mode);
    const contentComplete = buffer.length === parsed.evCount;
    const recomputedDigest = txDigest(buffer);
    const contentOk = contentComplete && recomputedDigest === parsed.digest;
    if (!contentComplete) evictedBlocks += 1;
    // Chain continuity: the block must point at the running previous seal.
    if (parsed.prev !== runningPrev) {
      breaks.push({ index, rev: parsed.rev, reason: 'chain-break', detail: `Block points at prev ${parsed.prevPrefix}… but the running chain head is ${runningPrev.slice(0, 12)}…` });
    }
    // Self-consistency: the seal must be the correct H over its own fields.
    const keyForMode = parsed.mode === 'hmac' ? key : null;
    if (parsed.mode === 'hmac' && !key) {
      breaks.push({ index, rev: parsed.rev, reason: 'key-missing', detail: 'Block is HMAC-sealed but no session key is registered; it cannot be verified in this session.' });
    } else {
      const expected = computeSeal({ prevSeal: parsed.prev, digest: parsed.digest, revision: parsed.rev, mode: parsed.mode, key: keyForMode });
      if (expected !== parsed.seal) {
        breaks.push({ index, rev: parsed.rev, reason: 'seal-mismatch', detail: `Recorded seal ${parsed.seal.slice(0, 12)}… does not recompute to ${expected.slice(0, 12)}… (mode ${parsed.mode}).` });
      }
    }
    if (contentComplete && !contentOk) {
      breaks.push({ index, rev: parsed.rev, reason: 'content-mismatch', detail: `The ${buffer.length} event(s) in this block hash to ${recomputedDigest.slice(0, 12)}…, not the recorded ${parsed.digestPrefix}… — an event inside a sealed block was changed.` });
    }
    blocks.push({
      index, rev: parsed.rev, seal: parsed.seal, prev: parsed.prev, digest: parsed.digest,
      evCount: parsed.evCount, mode: parsed.mode, root: parsed.root, ts: parsed.ts,
      contentOk, contentComplete, chainOk: parsed.prev === runningPrev,
    });
    sealedEvents += parsed.evCount;
    runningPrev = parsed.seal;
    buffer = [];
  });

  const trailingUnsealedEvents = buffer.length;
  const chainBreaks = breaks.filter((b) => b.reason === 'chain-break' || b.reason === 'seal-mismatch' || b.reason === 'key-missing');
  const contentBreaks = breaks.filter((b) => b.reason === 'content-mismatch');
  const mode = modes.size === 1 ? [...modes][0] : (modes.size > 1 ? 'mixed' : 'none');
  return {
    engineVersion: SEAL_ENGINE_VERSION,
    blocks: blocks.length,
    sealedEvents,
    leadingUnsealedEvents: leadingUnsealed,
    trailingUnsealedEvents,
    evictedBlocks,
    mode,
    keyed: mode === 'hmac' && Boolean(key),
    chainValid: chainBreaks.length === 0,
    contentValid: contentBreaks.length === 0,
    breaks,
    firstSealAt: blocks[0]?.ts || null,
    lastSealAt: blocks[blocks.length - 1]?.ts || null,
    chainHead: runningPrev,
    blockList: blocks.slice(-SEAL_LIMITS.blockListCap),
    verifiedAt: null, // stamped by caller
  };
}

/* ---------------------------------------------------------------- reports */

/** The chain status report for the Integrity surface. */
export function sealReport(state, { now = new Date(), settings = null } = {}) {
  const effective = settings || state?.settings || {};
  const last = lastSealEvent(state);
  const verification = verifySealChain(state);
  verification.verifiedAt = now.toISOString();
  const { mode, keyed } = sealModeFor(effective);
  return {
    engineVersion: SEAL_ENGINE_VERSION,
    enabled: effective.sealEnabled === true,
    autoPropagate: effective.sealAutoPropagate !== false,
    configuredMode: effective.sealMode || 'auto',
    activeMode: mode,
    keyed,
    blocks: verification.blocks,
    sealedEvents: verification.sealedEvents,
    lastSealAt: last?.parsed.ts || null,
    lastSealPrefix: last ? last.parsed.seal.slice(0, 12) : null,
    chainHead: verification.chainHead,
    verification,
  };
}

function ancestorsOfNode(chain, nodeId) {
  const out = [];
  let cursor = nodeId;
  let guard = 0;
  while (cursor && guard < 16) {
    out.push(cursor);
    const node = chain.nodes.get(cursor);
    const parent = node?.parentId || null;
    if (!parent || parent === cursor) break;
    cursor = parent;
    guard += 1;
  }
  return out;
}

/**
 * Per-span attestation roll-up: for every sealed transaction, the root event's
 * entity is resolved to its owning node in the reporting tree, and the sealed
 * transaction is counted at that node AND at every leadership ancestor — the
 * same tree the seat roll-up uses, so a frontline case sealed at commit shows
 * up at manager → director → VP → chief with zero re-entry.
 */
export function sealSpanAttestations(state, { now = new Date(), settings = null } = {}) {
  const effective = settings || state?.settings || {};
  const chain = buildChain(state, { now, settings: effective });
  const built = buildSeats(state, { now, settings: effective });
  const items = harvestWork(state, chain, { now, settings: effective });
  const itemByKey = new Map(items.map((item) => [`${item.type}:${item.entityId}`, item]));

  const rows = new Map();
  const rowFor = (seatId) => {
    if (!rows.has(seatId)) {
      const seat = built.byId.get(seatId);
      const node = chain.nodes.get(seatId);
      const altitude = altitudeByKey(node?.altitude || (seatId === 'leader' ? effective.chainLeaderAltitude : null));
      rows.set(seatId, {
        seatId,
        label: seat?.label || node?.name || 'Workspace leader',
        altitudeKey: altitude?.key || null,
        altitudeLabel: altitude?.label || 'Enterprise',
        rank: altitudeRank(node?.altitude || effective.chainLeaderAltitude),
        openWork: 0,
        sealedTx: 0,
        lastSealedAt: null,
      });
    }
    return rows.get(seatId);
  };

  for (const item of items) {
    const row = rowFor(item.ownerNodeId);
    row.openWork += 1;
  }

  const events = Array.isArray(state?.events) ? state.events : [];
  for (const event of events) {
    const parsed = parseSealEvent(event);
    if (!parsed || !parsed.root) continue;
    const [entity, ...rest] = parsed.root.split(':');
    const entityId = rest.join(':');
    const item = itemByKey.get(`${entity}:${entityId}`);
    const ownerNodeId = item ? item.ownerNodeId : 'leader';
    for (const seatId of ancestorsOfNode(chain, ownerNodeId)) {
      if (seatId === 'leader' || built.nodeIndex.has(seatId) || built.byId.has(seatId)) {
        const row = rowFor(seatId);
        row.sealedTx += 1;
        if (!row.lastSealedAt || (parsed.ts && parsed.ts > row.lastSealedAt)) row.lastSealedAt = parsed.ts;
      }
    }
  }

  const list = [...rows.values()].sort((a, b) => (a.rank - b.rank) || a.label.localeCompare(b.label));
  return list.slice(0, SEAL_LIMITS.spanRowCap);
}

/**
 * Seat scoping for the Integrity surface: under a declared seat, spans outside
 * the seat's own subtree collapse into one aggregate row — no sideways names,
 * no peer detail, counts survive upward. The undeclared operator sees all.
 */
export function scopeSealSpans(spans, state, { settings = null } = {}) {
  const effective = settings || state?.settings || {};
  if (!effective.activeSeatId) return { scoped: false, spans };
  const built = buildSeats(state, { settings: effective });
  const seat = activeSeat(built);
  if (seat.fullAccess) return { scoped: false, spans };
  const detailed = [];
  let outSeats = 0; let outSealed = 0; let outWork = 0;
  for (const row of spans) {
    if (seat.scope.has(row.seatId) || row.seatId === seat.id) detailed.push(row);
    else { outSeats += 1; outSealed += row.sealedTx; outWork += row.openWork; }
  }
  if (outSeats) {
    detailed.push({
      seatId: '__out-of-scope__', label: `${outSeats} span(s) outside this seat's subtree`,
      altitudeKey: null, altitudeLabel: 'aggregate only', rank: null,
      openWork: outWork, sealedTx: outSealed, lastSealedAt: null, aggregate: true,
    });
  }
  return { scoped: true, seatLabel: seat.label, seatRank: seat.rank, spans: detailed };
}

/** Nav badge: only a broken chain is attention-worthy. */
export function sealAttentionCount(state) {
  const v = verifySealChain(state);
  return v.breaks.length;
}

/**
 * Identity-free integrity certificate (Markdown). Carries no person ids, no
 * record content — only chain statistics, seal prefixes and the verdict.
 */
export function sealBriefText(report, spans) {
  const v = report.verification;
  const lines = [
    '# LeadOS Integrity Certificate',
    '',
    `- Engine: ${report.engineVersion}`,
    `- Generated at: ${v.verifiedAt || 'unknown'}`,
    `- Sealing enabled: ${report.enabled ? 'yes' : 'no'} (automatic pass ${report.autoPropagate ? 'on' : 'paused'})`,
    `- Seal mode: ${v.mode}${report.keyed ? ' (keyed HMAC — forgery-evident while the workspace is locked)' : ' (plain hash chain — tamper-evident against corruption and honest error; anyone with write access can recompute it)'}`,
    `- Blocks sealed: ${v.blocks}`,
    `- Events covered by seals: ${v.sealedEvents}`,
    `- Leading unsealed events (before the first seal): ${v.leadingUnsealedEvents}`,
    `- Blocks whose content was evicted by the event-log retention cap: ${v.evictedBlocks}`,
    `- Chain verdict: ${v.chainValid ? 'VALID from genesis' : `BROKEN — first break at block ${v.breaks[0]?.index ?? '?'}: ${v.breaks[0]?.reason || ''}`}`,
    `- Content verdict: ${v.contentValid ? 'VALID — every sealed block rehashes to its recorded digest' : 'BROKEN — a sealed block no longer matches its digest'}`,
    `- Chain head: ${v.chainHead.slice(0, 16)}…`,
    `- First seal: ${v.firstSealAt || 'none'} · Last seal: ${v.lastSealAt || 'none'}`,
    '',
    '## Span attestations (counts only)',
    '',
    '| Span | Altitude | Open work | Sealed transactions | Last seal |',
    '| --- | --- | ---: | ---: | --- |',
    ...(spans || []).map((s) => `| ${s.aggregate ? s.label : `${s.label} (rank ${s.rank ?? '—'})`} | ${s.altitudeLabel} | ${s.openWork} | ${s.sealedTx} | ${s.lastSealedAt ? dayKey(s.lastSealedAt) : '—'} |`),
    '',
    '## Limitations',
    '',
    '- This certificate proves the event log has not been altered since each block was sealed, under the stated mode. Plain-hash mode does not resist an attacker who can rewrite the whole log; HMAC mode does, without the passphrase-derived key, which is never stored.',
    '- Sealing is a local workspace property, not authentication and not a multi-user security boundary.',
    '- Blocks evicted by the retention cap remain chain-verified block-to-block but their content cannot be recomputed; they are counted above, never hidden.',
    '',
  ];
  return lines.join('\n');
}
