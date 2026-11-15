/**
 * app/core/domain/standardWaiverSchema.js — fail-closed storage contract for
 * the Temporary Standard Waiver Register (ADR-0212, Schema v166).
 *
 * WHAT IS STORED
 *   `standardWaiverRequests`   append-only dated REQUESTS. One request names the
 *                              routine whose written standard is being set
 *                              aside, the person who owes it, a kind, a written
 *                              reason, the safeguard that stands in for the
 *                              standard, and the window asked for.
 *   `standardWaiverGrants`     append-only dated ANSWERS. One answer is granted
 *                              (with its own window, never wider than the one
 *                              asked for) or refused, always with a written
 *                              basis, always by the holder of the line. A
 *                              granted row also carries an optional renewal
 *                              link, a revocation and the day it happened.
 *   `standardWaiverDecisions`  append-only dated CLOSING decisions: the standard
 *                              is back in force, or the routine was retired.
 *   seven settings             the conventions the register reads.
 *   `standardWaiverMarkers`    RULE-TSW-01's bounded idempotency / observation
 *                              ledger.
 *
 * WHAT IS NEVER STORED. A state, a chain length, a coverage share, a verdict, a
 * "lapsed" mark. Every one is derived on read, so what a leader reads cannot
 * drift from what the record holds.
 *
 * FAIL CLOSED, AND IN THE DIRECTION OF NO AUTHORITY. A malformed request, a
 * reason or safeguard below its declared floor, a window that is reversed or
 * absurdly long, a grant wider than its request, a decision dated before the
 * departure began — each is DROPPED with a counted warning, never repaired into
 * an authority nobody granted, and never rounded into a decision nobody made.
 * The one asymmetry is deliberate: a revocation FLAG plus a DAY is kept even
 * when no reason was written and no seat can be named, because dropping an
 * unrevoked-by-the-loader revocation is the drift the Bulletproof Reliability
 * Mandate forbids. Its missing reason is counted and printed instead.
 */

import {
  STANDARD_WAIVER_KIND_KEYS,
  STANDARD_WAIVER_DECISION_KEYS,
  STANDARD_WAIVER_BOUNDS,
  STANDARD_WAIVER_DEFAULTS,
  STANDARD_WAIVER_LIMITS,
  STANDARD_WAIVER_SETTING_KEYS,
} from './standardWaiverRegistry.js';

const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const id = (v) => str(v).slice(0, STANDARD_WAIVER_LIMITS.idMax);

/** A calendar day (`YYYY-MM-DD`) or null. A timestamp is truncated to its UTC day. */
export function standardWaiverDay(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** A full ISO timestamp, or null. Never truncated: the moment of an act is a fact. */
function stamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function standardWaiverDaysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** Window length inclusive of both ends: from = to means one day. */
export function standardWaiverWindowDays(from, to) {
  const d = standardWaiverDaysBetween(from, to);
  return d === null ? null : d + 1;
}

function boundedInt(value, [min, max], fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

export function normalizeStandardWaiverSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = STANDARD_WAIVER_SETTING_KEYS;
  const D = STANDARD_WAIVER_DEFAULTS;
  const B = STANDARD_WAIVER_BOUNDS;
  const defaultDays = boundedInt(src[K.defaultDays], B.defaultDays, D.defaultDays);
  const maxDays = boundedInt(src[K.maxDays], B.maxDays, D.maxDays);
  return {
    // A default window longer than the maximum would grant more than the
    // conventions permit; the maximum wins and the default is clamped to it.
    [K.defaultDays]: Math.min(defaultDays, maxDays, STANDARD_WAIVER_LIMITS.maxWindowDays),
    [K.maxDays]: Math.min(maxDays, STANDARD_WAIVER_LIMITS.maxWindowDays),
    [K.renewalReviewAfter]: boundedInt(src[K.renewalReviewAfter], B.renewalReviewAfter, D.renewalReviewAfter),
    [K.askDueDays]: boundedInt(src[K.askDueDays], B.askDueDays, D.askDueDays),
    [K.horizonDays]: boundedInt(src[K.horizonDays], B.horizonDays, D.horizonDays),
    [K.minOwedSlots]: boundedInt(src[K.minOwedSlots], B.minOwedSlots, D.minOwedSlots),
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

/** A window inside the hard ceiling, first day ≤ last day, both readable. */
function readWindow(item) {
  const from = standardWaiverDay(item?.from);
  const to = standardWaiverDay(item?.to);
  if (!from || !to || to < from) return null;
  const days = standardWaiverWindowDays(from, to);
  if (days === null || days < 1 || days > STANDARD_WAIVER_LIMITS.maxWindowDays) return null;
  return { from, to, days };
}

/**
 * @param raw       stored requests
 * @param routines  the routines on the record (id-keyed map or array)
 * @param warnings  load warnings (mutated)
 */
export function normalizeStandardWaiverRequests(raw, routines = [], warnings = []) {
  const arr = Array.isArray(raw) ? raw : [];
  const known = routines instanceof Map
    ? routines
    : new Map((Array.isArray(routines) ? routines : []).filter((r) => r && r.id).map((r) => [r.id, r]));
  const L = STANDARD_WAIVER_LIMITS;
  const out = [];
  const seen = new Set();
  let malformed = 0;
  let unknown = 0;
  let weak = 0;
  let badWindow = 0;
  for (const item of arr) {
    if (!isPlainObject(item)) { malformed += 1; continue; }
    const requestId = id(item.id);
    const routineId = id(item.routineId);
    const ownerId = id(item.ownerId);
    const kind = STANDARD_WAIVER_KIND_KEYS.includes(item.kind) ? item.kind : null;
    const reason = str(item.reason);
    const safeguard = str(item.safeguard);
    const at = stamp(item.at);
    const window = readWindow(item);
    if (!requestId || seen.has(requestId) || !routineId || !ownerId || !kind || !at) { malformed += 1; continue; }
    // A request naming a routine this workspace does not hold is not a request
    // against any standard: it is dropped, and NOT repaired onto a routine whose
    // id happens to look similar.
    if (!known.has(routineId)) { unknown += 1; continue; }
    if (reason.length < L.reasonMin || reason.length > L.reasonMax
      || safeguard.length < L.safeguardMin || safeguard.length > L.safeguardMax) { weak += 1; continue; }
    if (!window) { badWindow += 1; continue; }
    seen.add(requestId);
    out.push({
      id: requestId,
      routineId,
      ownerId,
      kind,
      reason: reason.slice(0, L.reasonMax),
      safeguard: safeguard.slice(0, L.safeguardMax),
      from: window.from,
      to: window.to,
      renewsRequestId: id(item.renewsRequestId) || null,
      at,
    });
  }
  if (malformed) warnings.push(`Standard waivers: dropped ${malformed} malformed request(s); none was repaired into a departure nobody asked for`);
  if (unknown) warnings.push(`Standard waivers: dropped ${unknown} request(s) naming a routine this workspace does not hold; a request against no standard set aside nothing`);
  if (weak) warnings.push(`Standard waivers: dropped ${weak} request(s) whose reason or safeguard is shorter than the declared floor; neither was padded to pass`);
  if (badWindow) warnings.push(`Standard waivers: dropped ${badWindow} request(s) whose window is missing, reversed or longer than the hard ceiling; a waiver is a bounded window`);
  // A renewal CLAIM on a request is the requester's own statement and is kept
  // only when it points at an earlier request of the SAME routine owed by the
  // SAME person. It grants nothing — the authority link lives on the grant — so
  // a dangling claim is dropped rather than repaired, and nothing is invented.
  const byRequestId = new Map(out.map((row) => [row.id, row]));
  const resolved = out.map((row) => {
    if (!row.renewsRequestId) return row;
    const predecessor = byRequestId.get(row.renewsRequestId);
    const keep = Boolean(predecessor && predecessor.id !== row.id && predecessor.routineId === row.routineId && predecessor.ownerId === row.ownerId);
    return keep ? row : { ...row, renewsRequestId: null };
  });
  resolved.sort((a, b) => String(b.at).localeCompare(String(a.at)) || String(a.id).localeCompare(String(b.id)));
  return resolved.length > L.requests ? resolved.slice(0, L.requests) : resolved;
}

/**
 * @param raw       stored grants
 * @param requests  the normalized requests
 * @param warnings  load warnings (mutated)
 */
export function normalizeStandardWaiverGrants(raw, requests = [], warnings = []) {
  const arr = Array.isArray(raw) ? raw : [];
  const byId = new Map((Array.isArray(requests) ? requests : []).filter((r) => r && r.id).map((r) => [r.id, r]));
  const L = STANDARD_WAIVER_LIMITS;
  const out = [];
  const seen = new Set();
  let malformed = 0;
  let orphan = 0;
  let weak = 0;
  let badWindow = 0;
  let wider = 0;
  let reasonlessRevocations = 0;
  for (const item of arr) {
    if (!isPlainObject(item)) { malformed += 1; continue; }
    const grantId = id(item.id);
    const requestId = id(item.requestId);
    const authoriserId = id(item.authoriserId);
    const decision = item.decision === 'granted' || item.decision === 'refused' ? item.decision : null;
    const basis = str(item.basis);
    const at = stamp(item.at);
    if (!grantId || seen.has(grantId) || !requestId || !authoriserId || !decision || !at) { malformed += 1; continue; }
    const request = byId.get(requestId);
    if (!request) { orphan += 1; continue; }
    if (basis.length < L.basisMin || basis.length > L.basisMax) { weak += 1; continue; }
    const revoked = item.revoked === true && Boolean(standardWaiverDay(item.revokedOn));
    const revokedOn = revoked ? standardWaiverDay(item.revokedOn) : null;
    const revokedReason = revoked ? str(item.revokedReason).slice(0, L.basisMax) || null : null;
    if (revoked && !revokedReason) reasonlessRevocations += 1;
    let window = null;
    let renewedFrom = null;
    if (decision === 'granted') {
      window = readWindow(item);
      if (!window) { badWindow += 1; continue; }
      // A grant may narrow the request and may never widen it. The door refuses
      // this; the loader refuses it again, because an imported file is a door.
      if (window.from < request.from || window.to > request.to) { wider += 1; continue; }
      // A renewal link that resolves to nothing is NOT repaired onto a nearby
      // request: the grant stands, its chain does not, and the dangling link is
      // counted so the panel can say the chain is unproven.
      const link = id(item.renewedFrom);
      if (link) {
        const predecessor = byId.get(link);
        if (predecessor && predecessor.routineId === request.routineId && predecessor.ownerId === request.ownerId) renewedFrom = link;
      }
    }
    seen.add(grantId);
    out.push({
      id: grantId,
      requestId,
      authoriserId,
      decision,
      basis: basis.slice(0, L.basisMax),
      from: window ? window.from : null,
      to: window ? window.to : null,
      renewedFrom,
      at,
      revoked,
      revokedOn,
      revokedById: revoked ? (id(item.revokedById) || null) : null,
      revokedReason,
    });
  }
  if (malformed) warnings.push(`Standard waivers: dropped ${malformed} malformed answer(s); none was repaired into an authority nobody gave`);
  if (orphan) warnings.push(`Standard waivers: dropped ${orphan} answer(s) naming no request on the register`);
  if (weak) warnings.push(`Standard waivers: dropped ${weak} answer(s) whose written basis is below the declared floor; none was padded to pass`);
  if (badWindow) warnings.push(`Standard waivers: dropped ${badWindow} granted answer(s) whose window is missing, reversed or over the hard ceiling; a grant with no window authorises nothing`);
  if (wider) warnings.push(`Standard waivers: dropped ${wider} granted answer(s) wider than the request they answer; authority is over what was asked, never more`);
  if (reasonlessRevocations) warnings.push(`Standard waivers: kept ${reasonlessRevocations} revocation(s) with no written reason and printed them as such — un-revoking one at load would be the drift the record forbids`);
  out.sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id)));
  return out.length > L.grants ? out.slice(out.length - L.grants) : out;
}

/**
 * @param raw       stored closing decisions
 * @param requests  the normalized requests
 * @param grants    the normalized grants
 * @param routines  the routines on the record
 * @param warnings  load warnings (mutated)
 */
export function normalizeStandardWaiverDecisions(raw, requests = [], grants = [], routines = [], warnings = []) {
  const arr = Array.isArray(raw) ? raw : [];
  const requestById = new Map((Array.isArray(requests) ? requests : []).filter((r) => r && r.id).map((r) => [r.id, r]));
  const routineById = new Map((routines instanceof Map ? [...routines.values()] : (Array.isArray(routines) ? routines : [])).filter((r) => r && r.id).map((r) => [r.id, r]));
  const grantedByRequest = new Map();
  for (const grant of Array.isArray(grants) ? grants : []) {
    if (grant && grant.decision === 'granted' && !grantedByRequest.has(grant.requestId)) grantedByRequest.set(grant.requestId, grant);
  }
  const L = STANDARD_WAIVER_LIMITS;
  const out = [];
  const seen = new Set();
  const seenRequest = new Set();
  let malformed = 0;
  let ungrounded = 0;
  let weak = 0;
  let beforeStart = 0;
  let duplicate = 0;
  let falseRetirement = 0;
  for (const item of arr) {
    if (!isPlainObject(item)) { malformed += 1; continue; }
    const decisionId = id(item.id);
    const requestId = id(item.requestId);
    const kind = STANDARD_WAIVER_DECISION_KEYS.includes(item.kind) ? item.kind : null;
    const decidedById = id(item.decidedById);
    const decidedOn = standardWaiverDay(item.decidedOn);
    const basis = str(item.basis);
    const at = stamp(item.at);
    if (!decisionId || seen.has(decisionId) || !requestId || !kind || !decidedById || !decidedOn || !at) { malformed += 1; continue; }
    const request = requestById.get(requestId);
    const grant = grantedByRequest.get(requestId) || null;
    // A decision closes an AUTHORISED departure. Without a granted answer there
    // is no departure to close, so the row would be a judgement about nothing.
    if (!request || !grant) { ungrounded += 1; continue; }
    if (basis.length < L.basisMin || basis.length > L.basisMax) { weak += 1; continue; }
    if (decidedOn < grant.from) { beforeStart += 1; continue; }
    if (kind === 'ended-with-routine') {
      const routine = routineById.get(request.routineId) || null;
      const retiredOn = routine ? routine.retiredOn : null;
      // The claim is checkable, so it is checked: a routine retired after the
      // decision day was still the standard on that day.
      if (!retiredOn || retiredOn > decidedOn) { falseRetirement += 1; continue; }
    }
    if (seenRequest.has(requestId)) { duplicate += 1; continue; }
    seen.add(decisionId);
    seenRequest.add(requestId);
    out.push({
      id: decisionId,
      requestId,
      kind,
      decidedById,
      decidedOn,
      basis: basis.slice(0, L.basisMax),
      at,
    });
  }
  if (malformed) warnings.push(`Standard waivers: dropped ${malformed} malformed closing decision(s)`);
  if (ungrounded) warnings.push(`Standard waivers: dropped ${ungrounded} decision(s) closing a request that was never granted; there was no departure to close`);
  if (weak) warnings.push(`Standard waivers: dropped ${weak} decision(s) whose written basis is below the declared floor`);
  if (beforeStart) warnings.push(`Standard waivers: dropped ${beforeStart} decision(s) dated before the departure began; a standard cannot be restored before it was suspended`);
  if (duplicate) warnings.push(`Standard waivers: dropped ${duplicate} second decision(s) against one waiver; the earliest decision stands and a later row would rewrite it`);
  if (falseRetirement) warnings.push(`Standard waivers: dropped ${falseRetirement} decision(s) claiming the routine was retired on a day the routine was still live; the record contradicted the claim`);
  out.sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id)));
  return out.length > L.decisions ? out.slice(out.length - L.decisions) : out;
}

export function normalizeStandardWaiverMarkers(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    if (!isPlainObject(item)) continue;
    const key = str(item.key).slice(0, 320);
    if (!key || seen.has(key)) continue;
    const kind = item.kind === 'ask' || item.kind === 'observation' ? item.kind : null;
    if (!kind) continue;
    seen.add(key);
    out.push({
      key,
      kind,
      subject: str(item.subject).slice(0, 160),
      taskId: str(item.taskId).slice(0, 80) || null,
      state: str(item.state).slice(0, 24),
      summary: str(item.summary).slice(0, 280),
      at: stamp(item.at),
    });
  }
  const cap = STANDARD_WAIVER_LIMITS.markers;
  return out.length > cap ? out.slice(out.length - cap) : out;
}

/**
 * A deterministic, identity-free signature over the condition a rule files.
 * FNV-1a over the kind and subject: the same condition on the same record
 * produces the same `tsw1:…` string, so an ask is idempotent and a changed
 * condition is a different ask — and no person, title or reason text is in it.
 */
export function standardWaiverSignature(kind, subject) {
  const joined = `${String(kind || '').trim()}\n${String(subject || '').trim()}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < joined.length; i += 1) {
    const code = joined.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
    h2 = (h2 + 0x9e3779b9) >>> 0;
  }
  return `tsw1:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function standardWaiverAskSummary(signature) {
  return `Standard waiver: ${String(signature || '').trim()}`;
}

export function parseStandardWaiverAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = summary.match(/^Standard waiver: (tsw1:[0-9a-f]{16})$/);
  return match ? { signature: match[1] } : null;
}

/** The earliest granted answer to a request, or null. One request, one authority. */
export function grantedAnswer(grants, requestId) {
  const rows = (Array.isArray(grants) ? grants : []).filter((g) => g && g.requestId === requestId);
  const granted = rows.filter((g) => g.decision === 'granted');
  if (!granted.length) return null;
  return granted.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id)))[0];
}

/** The earliest answer of any kind to a request, or null. */
export function firstAnswer(grants, requestId) {
  const rows = (Array.isArray(grants) ? grants : []).filter((g) => g && g.requestId === requestId);
  if (!rows.length) return null;
  return rows.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id)))[0];
}

/** The closing decision on a request, or null. */
export function closingDecision(decisions, requestId) {
  const rows = (Array.isArray(decisions) ? decisions : []).filter((d) => d && d.requestId === requestId);
  if (!rows.length) return null;
  return rows.slice().sort((a, b) => String(a.decidedOn).localeCompare(String(b.decidedOn)) || String(a.at).localeCompare(String(b.at)))[0];
}
