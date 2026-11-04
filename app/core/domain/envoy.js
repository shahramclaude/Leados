/**
 * app/core/domain/envoy.js — the Federated Envoy (`#/envoy`, ADR-0087).
 *
 * THE QUESTION THIS ANSWERS
 * -------------------------
 * Every other module in this workspace answers a question *inside* one record.
 * This one answers the question the product's own limits sections keep
 * deferring: **a real hierarchy is not one browser.** A span runs its own
 * workspace; the altitude above it is owed a summary. Without a server, the
 * only honest way to move that summary is a document that carries its own
 * proof — and that is what a packet is.
 *
 * WHAT IS ACTUALLY COMPUTED (named, not asserted)
 * -----------------------------------------------
 *  - **Canonicalisation** (RFC 8785-flavoured): every payload is hashed as
 *    canonical JSON with recursively sorted keys, so the same record hashes
 *    identically on any engine. `sealCrypto.canonicalJson` is the same function
 *    the Sealed Spine uses (ADR-0082); this module does not own a second one.
 *  - **Merkle commitment** (Merkle 1979; Bitcoin/CT-style binary tree with
 *    last-leaf duplication): per-item hashes are combined pairwise, so a
 *    packet can prove "these N items and no others" with a root, and a single
 *    altered item is localised to its own leaf instead of failing vaguely.
 *  - **Keyed or plain signature**: an HMAC-SHA256 over `packetId|merkleRoot`
 *    when the vault session key is present (forgery-resistant while locked),
 *    a plain SHA-256 otherwise — and the mode is printed on every surface,
 *    because the two are not the same claim. This is the ADR-0082 honesty
 *    contract applied to a document that leaves the machine.
 *  - **Disclosure projection**: an item travels with only the fields its
 *    receiving altitude may hold. A CEO's packet carries counts and enum
 *    words; a frontline lead's packet can carry titles. The projection is
 *    applied when building AND re-derived when ingesting, so a sender cannot
 *    claim `aggregate` while shipping a title.
 *  - **Idempotent, non-destructive ingest**: an identical item is a duplicate
 *    (no write). The same origin record with different content is a
 *    *divergence* — recorded, never overwritten, and turned into one governed
 *    decision by RULE-ENV-02. Two workspaces disagreeing is information, not
 *    a conflict to resolve silently in favour of whoever imported last.
 *  - **Cross-altitude carriage**: RULE-ENV-01 rolls an ingested packet up every
 *    leadership ancestor of the receiving span in the same transaction, so the
 *    packet is visible at each altitude in the form that altitude may hold.
 *
 * WHAT THIS MODULE REFUSES TO CLAIM
 * ---------------------------------
 *  - It is not authentication. A packet proves *integrity and provenance* of a
 *    document; it does not prove who ran the client that wrote it. The local
 *    seat is still a declaration, and every surface says so.
 *  - It is not encryption of the payload. A packet is readable by design; what
 *    it refuses is *detail above the receiving altitude's class*. If a packet
 *    must be confidential in transit, the existing vault export is the tool.
 *  - It does not merge two workspaces. It attests copies; the local record is
 *    never edited by a foreign packet.
 *  - It makes no inference about a person. Severity, value, age and status are
 *    properties of the artefact, and the terminal says so beside every figure.
 *
 * Pure module: no DOM, no storage, no network, no wall clock, no randomness.
 * Every entry point takes `now`, and hashing is synchronous by design.
 */

import { addDays, dayKey, daysBetween, round, weekKey } from '../time.js';
import { activeSealKey, canonicalJson, hmacSha256Hex, sha256Hex } from './sealCrypto.js';
import { buildSeats, activeSeat } from './seat.js';
// The house convention for a case's money: the same PERT expected-value
// computation every other module uses (`computePertImpact`), so a packet never
// invents a second definition of "how much is at stake".
import { computePertImpact } from './cases.js';
import { LEADER_ID } from './chain.js';
import { altitudeByKey } from './chainRegistry.js';
import {
  ENVOY_CELL_FLOOR,
  ENVOY_CLASSES,
  ENVOY_CLASS_LABELS,
  ENVOY_COVERAGE_WINDOW_DAYS,
  ENVOY_FIELDS,
  ENVOY_FORMAT,
  ENVOY_KINDS,
  ENVOY_KIND_LABELS,
  ENVOY_LIMITS,
  ENVOY_VERSION,
  ENVOY_FAILURE_LABELS,
  classForReceivingRank,
  classRank,
  envoyAltitudes,
} from './envoyRegistry.js';
import { envoyConventions, normalizeEnvoyPayload, projectFields } from './envoySchema.js';

export const ENVOY_ENGINE = 'federated-envoy-2026.11-v1';

/* ------------------------------------------------------------------ hashing */

/** The content commitment of one item: canonical JSON of (kind, fields). */
export function contentHashOf(kind, fields) {
  return sha256Hex(canonicalJson({ fields: fields || {}, kind }));
}

/**
 * Binary Merkle root over item hashes, in sorted order so the root is
 * independent of the order the sender happened to build the list in.
 * Last-leaf duplication is the standard Certificate-Transparency convention.
 */
export function merkleRootOf(hashes) {
  const leaves = (Array.isArray(hashes) ? hashes : [])
    .filter((h) => typeof h === 'string' && /^[0-9a-f]{64}$/i.test(h))
    .map((h) => h.toLowerCase())
    .sort();
  if (!leaves.length) return sha256Hex('');
  let layer = leaves;
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = i + 1 < layer.length ? layer[i + 1] : left;
      next.push(sha256Hex(`${left}${right}`));
    }
    layer = next;
  }
  return layer[0];
}

/** A packet's identity binds the root to who addressed it to which altitude. */
export function packetIdentity({ merkleRoot, originWorkspaceId, recipientAltitudeKey, createdAt }) {
  return sha256Hex(canonicalJson({
    createdAt: String(createdAt || ''),
    merkleRoot: String(merkleRoot || ''),
    originWorkspaceId: String(originWorkspaceId || ''),
    recipientAltitudeKey: String(recipientAltitudeKey || ''),
  })).slice(0, 32);
}

/** HMAC when a key is available, plain SHA-256 otherwise. The mode is printed. */
export function signPacket({ packetId, merkleRoot, key }) {
  const message = `${packetId}|${merkleRoot}`;
  if (key) {
    // `registerSealKey` accepts strings; normalise here so bytes and text agree.
    const keyBytes = key instanceof Uint8Array ? key : new TextEncoder().encode(String(key));
    return { keyed: true, alg: 'hmac-sha256', value: hmacSha256Hex(keyBytes, message) };
  }
  return { keyed: false, alg: 'sha256', value: sha256Hex(message) };
}

/* --------------------------------------------------------------- identity */

/**
 * A stable identifier for THIS workspace, derived from its own creation stamp.
 * It is not a secret and not a name: two installations that were created at the
 * same instant by the same leader would collide, which the packet says plainly
 * in its own limits.
 */
export function workspaceIdentity(state) {
  const meta = state?.meta || {};
  const settings = state?.settings || {};
  return sha256Hex(canonicalJson({
    appId: String(state?.appId || 'leados'),
    createdAt: String(meta.createdAt || ''),
    leader: String(settings.leaderName || ''),
  })).slice(0, 16);
}

export function workspaceLabel(state) {
  const settings = state?.settings || {};
  const org = String(settings.organizationName || '').trim();
  const leader = String(settings.leaderName || '').trim();
  const base = org || (leader ? `${leader}’s workspace` : 'A LeadOS workspace');
  return base.slice(0, ENVOY_LIMITS.labelChars);
}

/* -------------------------------------------------------------- candidates */

const CRITICAL_SEVERITY = 7;
const CRITICAL_VALUE = 50_000;

function severityOf(record) {
  const raw = record?.fmea?.severity;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : null;
}

function moneyOf(record) {
  const fin = record?.financial || {};
  const currency = String(fin.currency || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  let expected = null;
  try {
    const pert = computePertImpact(fin, record?.fmea || {});
    if (pert?.cost?.measured && Number.isFinite(pert.cost.expected) && pert.cost.expected > 0) {
      expected = Math.round(pert.cost.expected);
    }
  } catch { expected = null; }
  if (expected === null) return null;
  return { currency, amount: expected };
}

function ageDaysOf(record, now) {
  const day = String(record?.openedOn || record?.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const diff = daysBetween(day, dayKey(now));
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff)) : null;
}

/**
 * Every artefact the sending span owns, as raw field bags. Selection is the
 * span's own records — never the whole workspace's — so a manager cannot
 * publish a peer span's cases upward by accident.
 */
export function collectCandidates(state, { spanIds = null, now = new Date(), limit = ENVOY_LIMITS.items } = {}) {
  const inside = (id) => (spanIds ? spanIds.has(id) : true);
  const candidates = [];

  for (const record of Array.isArray(state?.cases) ? state.cases : []) {
    if (!record || !record.title) continue;
    if (record.ownerId && !inside(record.ownerId)) continue;
    const money = moneyOf(record);
    candidates.push({
      kind: 'case',
      originId: record.id,
      sortKey: String(record.openedOn || ''),
      values: {
        kind: String(record.kind || 'risk').slice(0, 40),
        status: String(record.status || 'open').slice(0, 20),
        severity: severityOf(record),
        openedOn: record.openedOn || null,
        valueCurrency: money ? money.currency : null,
        valueAmount: money ? money.amount : null,
        title: record.title,
      },
      ageDays: ageDaysOf(record, now),
      critical: (record.status === 'open' || record.status === 'mitigating')
        && ((severityOf(record) || 0) >= CRITICAL_SEVERITY || (money ? money.amount : 0) >= CRITICAL_VALUE),
      open: record.status === 'open' || record.status === 'mitigating',
      money,
    });
  }

  for (const record of Array.isArray(state?.decisions) ? state.decisions : []) {
    if (!record || !record.title) continue;
    candidates.push({
      kind: 'decision',
      originId: record.id,
      sortKey: String(record.date || ''),
      values: {
        status: record.chosen ? (record.reviewedOn ? 'reviewed' : 'decided') : 'open',
        reversibility: String(record.reversibility || '').slice(0, 20),
        date: record.date || null,
        decidedOn: record.decidedOn || null,
        title: record.title,
      },
      critical: false,
      open: !record.chosen,
      money: null,
    });
  }

  for (const record of Array.isArray(state?.mandates) ? state.mandates : []) {
    if (!record || !record.id) continue;
    const seats = [record.fromSeatId, record.toSeatId].filter(Boolean);
    if (spanIds && seats.length && !seats.some((id) => inside(id))) continue;
    const expiresOn = String(record.expiresOn || '').slice(0, 10);
    candidates.push({
      kind: 'mandate',
      originId: record.id,
      sortKey: String(record.createdAt || ''),
      values: {
        status: String(record.status || 'proposed').slice(0, 20),
        actionClass: (Array.isArray(record.actions) ? record.actions.join(', ') : '').slice(0, 60),
        expiresOn: expiresOn || null,
        outcome: String(record.outcome || '').slice(0, 160),
      },
      critical: false,
      open: record.status === 'proposed' || record.status === 'accepted',
      money: null,
    });
  }

  for (const record of Array.isArray(state?.catchballPacts) ? state.catchballPacts : []) {
    if (!record || !record.title) continue;
    if (record.toSeatId && !inside(record.toSeatId)) continue;
    candidates.push({
      kind: 'pact',
      originId: record.id,
      sortKey: String(record.createdAt || ''),
      values: {
        status: String(record.status || 'proposed').slice(0, 20),
        horizonDays: Number.isFinite(Number(record.horizonDays)) ? Math.round(Number(record.horizonDays)) : null,
        rounds: Number.isFinite(Number(record.roundCount)) ? Math.round(Number(record.roundCount)) : null,
        leadingTargetPct: Number.isFinite(Number(record.leadingTargetPct)) ? Math.round(Number(record.leadingTargetPct)) : null,
        laggingTargetPct: Number.isFinite(Number(record.laggingTargetPct)) ? Math.round(Number(record.laggingTargetPct)) : null,
        title: record.title,
      },
      critical: false,
      open: record.status === 'proposed' || record.status === 'countered' || record.status === 'agreed',
      money: null,
    });
  }

  candidates.sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)) || a.kind.localeCompare(b.kind));
  return candidates.slice(0, Math.max(1, Math.min(ENVOY_LIMITS.items, limit)));
}

/** Aggregate-only attestation: the part every altitude may hold. */
export function attestationOf(candidates, now = new Date()) {
  const byKind = Object.fromEntries(ENVOY_KINDS.map((kind) => [kind, 0]));
  let openCritical = 0;
  let oldestOpenDays = null;
  const money = new Map();
  for (const candidate of candidates) {
    byKind[candidate.kind] = (byKind[candidate.kind] || 0) + 1;
    if (candidate.critical) openCritical += 1;
    const age = candidate.ageDays;
    if (candidate.open && Number.isFinite(age)) {
      oldestOpenDays = oldestOpenDays === null ? age : Math.max(oldestOpenDays, age);
    }
    if (candidate.money) {
      const prev = money.get(candidate.money.currency) || 0;
      money.set(candidate.money.currency, Math.min(1_000_000_000_000, prev + candidate.money.amount));
    }
  }
  void now;
  return {
    items: candidates.length,
    byKind,
    openCritical,
    oldestOpenDays,
    valueAtStake: [...money.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([currency, amount]) => ({ currency, amount })),
  };
}

/** Project candidates at a receiving class. Withheld items keep their reason. */
export function projectCandidates(candidates, maxClass) {
  const items = [];
  const withheld = [];
  for (const candidate of candidates) {
    const projected = projectFields(candidate.kind, candidate.values, maxClass);
    if (!projected.cls) {
      withheld.push({
        kind: candidate.kind,
        originId: candidate.originId,
        need: cheapestClassFor(candidate.kind),
      });
      continue;
    }
    items.push({
      kind: candidate.kind,
      originId: candidate.originId,
      revision: null,
      cls: projected.cls,
      contentHash: contentHashOf(candidate.kind, projected.fields),
      fields: projected.fields,
    });
  }
  return { items, withheld };
}

/** The cheapest class at which a kind still carries at least one field. */
function cheapestClassFor(kind) {
  const spec = ENVOY_FIELDS[kind] || [];
  for (const cls of ENVOY_CLASSES) {
    if (spec.some((field) => field.cls === cls)) return cls;
  }
  return 'detail';
}

/* ------------------------------------------------------------------- build */

/**
 * Build one packet. `state` is read, never written; the caller persists the
 * ledger row and the packet text.
 */
export function buildPacket(state, {
  now = new Date(),
  settings = null,
  recipientSeatId = null,
  recipientAltitudeKey = 'manager',
  purpose = '',
  spanIds = null,
  schemaVersion = null,
  key = null,
  limit = null,
} = {}) {
  const conventions = envoyConventions(settings || state?.settings || {});
  const cap = Math.min(ENVOY_LIMITS.items, Math.max(1, Number(limit || conventions.envoyMaxItems) || conventions.envoyMaxItems));
  const candidates = collectCandidates(state, { spanIds, now, limit: cap });
  const rank = altitudeByKey(recipientAltitudeKey)?.rank || 5;
  const recipientClass = classForReceivingRank(rank);
  const { items, withheld } = projectCandidates(candidates, recipientClass);
  const attestation = attestationOf(candidates, now);
  const merkleRoot = merkleRootOf(items.map((item) => item.contentHash));
  const createdAt = now.toISOString();
  const originWorkspaceId = workspaceIdentity(state);
  const packetId = packetIdentity({ merkleRoot, originWorkspaceId, recipientAltitudeKey, createdAt });
  const signature = signPacket({ packetId, merkleRoot, key });
  return {
    format: ENVOY_FORMAT,
    version: ENVOY_VERSION,
    schemaVersion: schemaVersion === null ? null : Number(schemaVersion),
    packetId,
    originWorkspaceId,
    originLabel: workspaceLabel(state),
    recipientSeatId,
    recipientAltitudeKey,
    recipientClass,
    purpose: String(purpose || '').trim().slice(0, ENVOY_LIMITS.purposeChars),
    createdAt,
    items,
    withheld,
    omittedCount: Math.max(0, candidates.length - items.length - withheld.length),
    attestation,
    merkleRoot,
    signature: { keyed: signature.keyed, alg: signature.alg, value: signature.value },
    limits: {
      itemCap: cap,
      note: signature.keyed
        ? 'Keyed (HMAC-SHA256) with this workspace’s vault session key. A receiver without the key cannot verify the signature and should say so rather than accept it.'
        : 'Plain SHA-256. Integrity against corruption and honest mistakes only — anyone who can rewrite the file can recompute this hash. Unlock the vault to sign keyed.',
    },
  };
}

/* ------------------------------------------------------------------ verify */

export function parsePacket(input) {
  if (input && typeof input === 'object') return { packet: input, error: null };
  if (typeof input !== 'string') return { packet: null, error: 'Paste a packet (JSON) or choose a packet this workspace already holds.' };
  if (input.length > ENVOY_LIMITS.packetChars) return { packet: null, error: 'That packet is larger than the declared bound and was not read.' };
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { packet: null, error: 'A packet is a JSON object, not a list or a scalar.' };
    return { packet: parsed, error: null };
  } catch (error) {
    return { packet: null, error: `That is not valid JSON: ${(error && error.message) || 'parse failed'}` };
  }
}

/**
 * Recompute everything a receiver can recompute. Returns typed failures in the
 * declared order — the first one is the printed reason, and nothing is written
 * when any exist.
 */
export function verifyPacket(input, { settings = null, key = undefined, localSchemaVersion = null } = {}) {
  // `undefined` means "use this session's key if the vault is unlocked"; an
  // explicit `null` means "verify without a key", which is what the refusal
  // paths and the tests use to prove a keyed packet cannot be checked blind.
  const sessionKey = key === undefined ? activeSealKey() : key;
  const failures = [];
  const push = (code, detail, itemId = null) => failures.push({ code, itemId, detail: String(detail || '').slice(0, 240) });
  const { packet, error } = parsePacket(input);
  if (error) {
    push('shape', error);
    return { ok: false, failures, packet: null, counts: { items: 0, withheld: 0 } };
  }
  if (packet.format !== ENVOY_FORMAT) push('format', `Expected ${ENVOY_FORMAT}.`);
  if (Number(packet.version) !== ENVOY_VERSION) push('version', `Expected version ${ENVOY_VERSION}.`);
  if (localSchemaVersion !== null && Number(packet.schemaVersion) > Number(localSchemaVersion)) {
    push('schema-ahead', `Packet schema ${packet.schemaVersion} is newer than this workspace (${localSchemaVersion}).`);
  }
  const rawItems = Array.isArray(packet.items) ? packet.items : null;
  if (!rawItems) push('shape', 'The packet carries no item list.');
  const items = rawItems || [];
  if (items.length > ENVOY_LIMITS.items) push('size', `${items.length} items exceeds the declared bound of ${ENVOY_LIMITS.items}.`);
  if (typeof packet.merkleRoot !== 'string' || !/^[0-9a-f]{64}$/i.test(packet.merkleRoot)) push('shape', 'The packet carries no valid Merkle root.');

  const hashes = [];
  const seen = new Map();
  const cleanItems = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') {
      push('shape', 'An item is not an object.');
      continue;
    }
    const kind = String(raw.kind || '');
    const originId = String(raw.originId || '');
    const declared = String(raw.contentHash || '').toLowerCase();
    if (!ENVOY_KINDS.includes(kind) || !originId || !/^[0-9a-f]{64}$/.test(declared)) {
      push('shape', `An item (${kind || 'unknown'}) is missing a kind, an origin id or a content hash.`, originId || null);
      continue;
    }
    if (!ENVOY_CLASSES.includes(String(raw.cls || ''))) {
      push('shape', `An item (${kind}) declares an unrecognised disclosure class.`, originId);
      continue;
    }
    const payload = normalizeEnvoyPayload(kind, raw.fields, String(raw.cls), [], originId);
    if (!payload) {
      push('shape', `An item (${kind}) has no payload that survives its own whitelist.`, originId);
      continue;
    }
    const recomputed = contentHashOf(kind, payload.fields);
    if (recomputed !== declared) {
      push('item-hash', `Item ${kind}:${originId} hashes to ${recomputed.slice(0, 12)}… but claims ${declared.slice(0, 12)}….`, originId);
      continue;
    }
    const key = `${kind}:${originId}`;
    if (seen.has(key) && seen.get(key) !== declared) {
      push('duplicate-item', `Item ${key} appears twice with different content.`, originId);
      continue;
    }
    seen.set(key, declared);
    hashes.push(declared);
    cleanItems.push({
      kind,
      originId,
      revision: Number.isFinite(Number(raw.revision)) ? Math.round(Number(raw.revision)) : null,
      cls: payload.cls,
      contentHash: declared,
      fields: payload.fields,
    });
  }

  const root = merkleRootOf(hashes);
  if (typeof packet.merkleRoot === 'string' && /^[0-9a-f]{64}$/i.test(packet.merkleRoot) && packet.merkleRoot.toLowerCase() !== root) {
    push('merkle-root', `Recomputed root ${root.slice(0, 12)}… does not match the packet’s ${packet.merkleRoot.slice(0, 12)}….`);
  }
  const expectedId = packetIdentity({
    merkleRoot: root,
    originWorkspaceId: packet.originWorkspaceId,
    recipientAltitudeKey: packet.recipientAltitudeKey,
    createdAt: packet.createdAt,
  });
  if (String(packet.packetId || '') !== expectedId) {
    push('packet-id', `Recomputed identity ${expectedId} does not match the packet’s ${String(packet.packetId || 'none')}.`);
  }

  const signature = packet.signature && typeof packet.signature === 'object' ? packet.signature : null;
  if (!signature || typeof signature.value !== 'string') {
    push('signature', 'The packet carries no signature.');
  } else {
    const expected = signPacket({ packetId: expectedId, merkleRoot: root, key: signature.keyed ? sessionKey : null });
    if (signature.value.toLowerCase() !== expected.value) {
      push('signature', signature.keyed
        ? 'The keyed signature does not verify. Either the packet was altered, or it was signed with a different session key than the one unlocked here.'
        : 'The plain signature does not verify.');
    }
  }

  const conventions = envoyConventions(settings || {});
  if (conventions.envoyRequireKeyedSignature && signature && signature.keyed !== true) {
    push('signature-required', 'This workspace requires a key-signed packet. Unlock the vault in the sending workspace and rebuild it.');
  }

  return {
    ok: failures.length === 0,
    failures,
    packet: {
      ...packet,
      items: cleanItems,
      merkleRoot: root,
      packetId: expectedId,
    },
    counts: { items: cleanItems.length, withheld: Array.isArray(packet.withheld) ? packet.withheld.length : 0 },
  };
}

/** The first failure, in plain language. */
export function failureText(failures) {
  if (!Array.isArray(failures) || !failures.length) return '';
  const first = failures[0];
  const label = ENVOY_FAILURE_LABELS[first.code] || first.code;
  return `${label}${first.detail ? ` — ${first.detail}` : ''}`;
}

/**
 * Ingest-side altitude gate: a packet is addressed to ONE altitude. A seat that
 * sits below the address cannot read it (that would hand a frontline lead a
 * chief-level aggregate with no names and call it detail); a seat above it may
 * read it, because it is already the narrowest form.
 */
export function recipientVerdict(packet, { receiverRank = null } = {}) {
  if (receiverRank === null || receiverRank === undefined) return { ok: true, reason: '' };
  const addressedRank = altitudeByKey(packet?.recipientAltitudeKey)?.rank || 5;
  const receiverClass = classForReceivingRank(receiverRank);
  const addressedClass = String(packet?.recipientClass || classForReceivingRank(addressedRank));
  if (classRank(receiverClass) < classRank(addressedClass)) {
    return {
      ok: false,
      reason: `This packet was built for a ${altitudeByKey(packet?.recipientAltitudeKey)?.label || 'higher altitude'} (${ENVOY_CLASS_LABELS[addressedClass] || addressedClass}). Your seat holds ${ENVOY_CLASS_LABELS[receiverClass] || receiverClass}, so ingesting it would deliver less than it promises. Ask the sending span to rebuild it for your altitude.`,
    };
  }
  return { ok: true, reason: '' };
}

/* -------------------------------------------------------------- ingest plan */

/**
 * What an ingest WOULD do, given a verified packet and the local ledger.
 * Pure: the action persists the plan, so the same decision is testable.
 */
export function planIngest(state, packet, { now = new Date() } = {}) {
  const existing = Array.isArray(state?.exchangeArtefacts) ? state.exchangeArtefacts : [];
  const byOrigin = new Map();
  for (const row of existing) {
    if (!row || row.originWorkspaceId !== packet.originWorkspaceId) continue;
    const key = `${row.kind}:${row.originId}`;
    const list = byOrigin.get(key) || [];
    list.push(row);
    byOrigin.set(key, list);
  }
  const plan = [];
  for (const item of packet.items || []) {
    const key = `${item.kind}:${item.originId}`;
    const prior = byOrigin.get(key) || [];
    if (prior.some((row) => row.contentHash === item.contentHash && row.status !== 'diverged')) {
      plan.push({ ...item, status: 'duplicate' });
      continue;
    }
    if (prior.length) {
      plan.push({ ...item, status: 'diverged' });
      continue;
    }
    plan.push({ ...item, status: 'imported' });
  }
  void now;
  return plan;
}

/* ------------------------------------------------------------------ report */

export function wilsonInterval(k, n, z = 1.96) {
  if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0) return { lo: null, hi: null };
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    lo: Math.max(0, Math.round((centre - margin) * 1000) / 10),
    hi: Math.min(100, Math.round((centre + margin) * 1000) / 10),
  };
}

/**
 * The derived read model. Every figure is computed from the ledger; nothing is
 * stored, so the report can never drift from the packets it describes.
 */
export function envoyReport(state, { now = new Date(), settings = null, seat = null } = {}) {
  const conventions = envoyConventions(settings || state?.settings || {});
  const packets = Array.isArray(state?.exchangePackets) ? state.exchangePackets : [];
  const artefacts = Array.isArray(state?.exchangeArtefacts) ? state.exchangeArtefacts : [];
  const built = buildSeats(state, { now, settings: settings || state?.settings || {} });
  const viewing = seat || activeSeat(built);
  const today = dayKey(now);

  const visible = packets.filter((packet) => {
    if (!viewing || viewing.fullAccess || !viewing.scope) return true;
    if (packet.direction === 'outbound') return true;
    if (!packet.recipientSeatId) return viewing.isLeader === true;
    return viewing.scope.has(packet.recipientSeatId);
  });

  const inbound = visible.filter((packet) => packet.direction === 'inbound');
  const outbound = visible.filter((packet) => packet.direction === 'outbound');
  const ingested = inbound.filter((packet) => packet.status === 'ingested');
  const refused = visible.filter((packet) => packet.status === 'refused');

  const artefactRows = artefacts.filter((row) => visible.some((packet) => packet.packetId === row.packetId));
  const divergences = artefactRows.filter((row) => row.status === 'diverged');
  const duplicates = artefactRows.filter((row) => row.status === 'duplicate');

  const windowStart = dayKey(addDays(now, -ENVOY_COVERAGE_WINDOW_DAYS));
  const current = ingested.filter((packet) => String(packet.receivedAt || packet.createdAt || '').slice(0, 10) >= windowStart);

  const seats = (built.seats || []).filter((s) => s.rank >= 2);
  const coverage = seats.map((s) => {
    const rows = ingested.filter((packet) => packet.recipientSeatId === s.id);
    const latest = rows.map((packet) => String(packet.receivedAt || packet.createdAt || '').slice(0, 10)).sort().at(-1) || null;
    return {
      seatId: s.id,
      label: s.name,
      rank: s.rank,
      altitudeKey: s.altitudeKey,
      packets: rows.length,
      lastPacketOn: latest,
      daysAgo: latest ? Math.max(0, daysBetween(latest, today)) : null,
      current: Boolean(latest && latest >= windowStart),
    };
  });
  const coveredCount = coverage.filter((row) => row.current).length;
  const rateRefusal = coverage.length < ENVOY_CELL_FLOOR
    ? `Coverage is refused below ${ENVOY_CELL_FLOOR} spans: a share over one or two spans is a description of those spans, not a rate.`
    : null;
  const coveragePct = rateRefusal ? null : round((coveredCount / coverage.length) * 100, 1);
  const wilson = rateRefusal ? { lo: null, hi: null } : wilsonInterval(coveredCount, coverage.length);

  const attested = ingested.reduce((acc, packet) => {
    const a = packet.attestation || {};
    acc.items += Number(a.items) || 0;
    acc.openCritical += Number(a.openCritical) || 0;
    for (const row of Array.isArray(a.valueAtStake) ? a.valueAtStake : []) {
      const prev = acc.money.get(row.currency) || 0;
      acc.money.set(row.currency, prev + (Number(row.amount) || 0));
    }
    return acc;
  }, { items: 0, openCritical: 0, money: new Map() });

  const verifiedInWindow = current.length;

  return {
    engineVersion: ENVOY_ENGINE,
    conventions,
    today,
    workspaceId: workspaceIdentity(state),
    workspaceLabel: workspaceLabel(state),
    packets: visible.slice(0, 120),
    inbound: inbound.length,
    outbound: outbound.length,
    stats: {
      packets: visible.length,
      ingested: ingested.length,
      verifiedInWindow,
      refused: refused.length,
      itemsImported: artefactRows.filter((row) => row.status === 'imported').length,
      duplicates: duplicates.length,
      divergences: divergences.length,
      withheld: visible.reduce((n, packet) => n + (Number(packet.withheldCount) || 0), 0),
      spans: coverage.length,
      spansCovered: coveredCount,
      coveragePct,
      coverageRefusal: rateRefusal,
      coverageWilson: wilson,
      keyedShare: ingested.length
        ? round((ingested.filter((packet) => packet.signatureKeyed).length / ingested.length) * 100, 1)
        : null,
      lastInboundOn: inbound.map((packet) => String(packet.receivedAt || packet.createdAt || '').slice(0, 10)).sort().at(-1) || null,
    },
    divergences: divergences.slice(0, 60),
    coverage,
    attested: {
      packets: ingested.length,
      items: attested.items,
      openCritical: attested.openCritical,
      valueAtStake: [...attested.money.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([currency, amount]) => ({ currency, amount })),
      riskSharePct: attested.items ? round((attested.openCritical / attested.items) * 100, 1) : null,
    },
    altitudes: envoyAltitudes(),
    limits: [
      'A packet proves the integrity and provenance of a document; it does not prove who ran the client that wrote it. The operating seat is still a declaration, not authentication.',
      'Packets are not encrypted. Detail above the receiving altitude’s class is refused at the source, not hidden inside the file.',
      'This workspace never edits its own record from a foreign packet. An imported artefact is an attested copy, and a disagreement opens a decision instead of overwriting.',
      'No figure in this terminal rates a person. Severity, value and age are properties of the artefact.',
    ],
  };
}

/* -------------------------------------------------------------------- brief */

/** Identity-free text: what a chief can hand to a board without exposing anyone. */
export function envoyBriefText(report, now = new Date()) {
  const s = report.stats;
  const lines = [];
  lines.push('LEADOS — FEDERATED EXCHANGE ATTESTATION');
  lines.push(`Generated: ${dayKey(now)} · Engine ${report.engineVersion}`);
  lines.push(`Workspace: ${report.workspaceId} (identity derived from its own creation stamp; not a legal entity identifier)`);
  lines.push('');
  lines.push('COVERAGE');
  lines.push(`- ${s.spansCovered} of ${s.spans} leadership spans received a verified inbound packet inside the last ${ENVOY_COVERAGE_WINDOW_DAYS} days.`);
  lines.push(`- Share of spans current: ${s.coveragePct === null ? `refused (${s.coverageRefusal})` : `${s.coveragePct}% (Wilson 95%: ${s.coverageWilson.lo}–${s.coverageWilson.hi}%)`}.`);
  lines.push('');
  lines.push('PACKETS');
  lines.push(`- Inbound packets held: ${report.inbound}. Ingested: ${s.ingested}. Refused at verification: ${s.refused}.`);
  lines.push(`- Items imported as attested copies: ${s.itemsImported}. Identical re-sends collapsed: ${s.duplicates}. Open divergences: ${s.divergences}.`);
  lines.push(`- Items withheld by disclosure class at the source: ${s.withheld}.`);
  lines.push(`- Keyed (HMAC) share of ingested packets: ${s.keyedShare === null ? 'not measurable yet' : `${s.keyedShare}%`}.`);
  lines.push('');
  lines.push('ATTESTED EXPOSURE (the sending spans’ own counts, not this workspace’s measurement)');
  lines.push(`- Artefacts attested: ${report.attested.items}. Recorded as open and critical by the sending record: ${report.attested.openCritical} (${report.attested.riskSharePct === null ? 'share refused' : `${report.attested.riskSharePct}%`}).`);
  for (const row of report.attested.valueAtStake) {
    lines.push(`- Value at stake, ${row.currency}: ${row.amount.toLocaleString('en-US')} (sum of the sending records’ own declared figures; never pooled across currencies).`);
  }
  lines.push('');
  lines.push('METHOD');
  lines.push('Canonical JSON per item → SHA-256 content hash → binary Merkle root with last-leaf duplication → packet identity bound to origin, recipient altitude and creation stamp → HMAC-SHA256 when the vault is unlocked, plain SHA-256 otherwise. Each figure above is recomputed from the local packet ledger on read.');
  lines.push('');
  lines.push('LIMITS');
  for (const limit of report.limits) lines.push(`- ${limit}`);
  return lines.join('\n');
}

/* ---------------------------------------------------------------------- csv */

/** Aggregate-only rows. No titles, no origin ids, no purpose text, no person. */
export function envoyCsvRows(state, { now = new Date(), settings = null } = {}) {
  const report = envoyReport(state, { now, settings });
  const rows = [];
  for (const packet of [...report.packets].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    const small = (Number(packet.itemCount) || 0) < ENVOY_CELL_FLOOR;
    rows.push({
      row_kind: 'packet',
      direction: packet.direction,
      recipient_altitude: packet.recipientAltitudeKey,
      recipient_class: packet.recipientClass,
      status: packet.status,
      items: packet.itemCount,
      withheld: packet.withheldCount,
      omitted: packet.omittedCount,
      keyed: packet.signatureKeyed ? 1 : 0,
      verified: packet.verification && packet.verification.ok ? 1 : 0,
      failures: packet.verification ? packet.verification.failures.map((f) => f.code).join('|') : '',
      attested_open_critical: small ? '' : packet.attestation?.openCritical ?? '',
      attested_oldest_open_days: small ? '' : packet.attestation?.oldestOpenDays ?? '',
      received_on: String(packet.receivedAt || '').slice(0, 10),
      created_on: String(packet.createdAt || '').slice(0, 10),
    });
  }
  rows.push({
    row_kind: 'workspace',
    direction: '',
    recipient_altitude: '',
    recipient_class: '',
    status: 'summary',
    items: report.stats.ingested,
    withheld: report.stats.withheld,
    omitted: report.stats.divergences,
    keyed: '',
    verified: '',
    failures: '',
    attested_open_critical: report.attested.openCritical,
    attested_oldest_open_days: '',
    received_on: report.stats.lastInboundOn || '',
    created_on: report.today,
  });
  return rows;
}

/* ------------------------------------------------------------------ signals */

/** What deserves a human today, counted for the nav badge. */
export function envoyAttentionCount(state, { now = new Date(), settings = null } = {}) {
  const report = envoyReport(state, { now, settings });
  const openDivergences = report.divergences.length;
  const refusals = report.packets.filter((packet) => packet.status === 'refused').length;
  const stale = report.coverage.filter((row) => !row.current && row.packets > 0).length;
  return Math.min(99, openDivergences + refusals + stale);
}

/** The exact packet text a workspace hands over (stable, pretty-printed JSON). */
export function packetText(packet) {
  return `${JSON.stringify(packet, null, 2)}\n`;
}

/** A weekly idempotency key for the divergence rule (one decision per record). */
export function divergenceTag(now, originWorkspaceId, kind, originId) {
  return `divergence:${weekKey(now) || dayKey(now)}:${originWorkspaceId}:${kind}:${originId}`;
}

export const LEADER_SEAT_ID = LEADER_ID;
