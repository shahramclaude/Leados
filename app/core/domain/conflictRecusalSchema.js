/**
 * app/core/domain/conflictRecusalSchema.js — the storage contract of the
 * Decision-Maker Conflict-of-Interest & Recusal Ledger (ADR-0210, Schema v164).
 *
 * Four collections, all EMPTY at upgrade: `conflictInterests`,
 * `conflictStandings`, `conflictRules` and the rule's `conflictRecusalMarkers`.
 * Nothing derived is stored — no verdict, no position, no coverage claim, no
 * effective/ineffective reading. Every state is re-derived on read from the
 * declared rows plus the record they name, so a corrected approver or a
 * reversed standing changes the reading the way the record actually changed.
 *
 * FAIL CLOSED. A row that cannot be read exactly is dropped with a counted
 * warning and never repaired. An interest whose record id or kind is unknown is
 * not "probably a decision" — it is unreadable, because a register that guesses
 * which record an interest touches would attach a named person's stake to a
 * decision nobody declared it against. A standing record whose interest is gone
 * is admitted only where the interest it names exists; a supersession pointing
 * at itself is refused at load as it is at the door.
 */

import {
  CONFLICT_DIRECTION_KEYS,
  CONFLICT_RECUSAL_LIMITS,
  CONFLICT_RELATIONSHIP_KEYS,
  CONFLICT_RELATIONSHIP_BY_KEY,
  CONFLICT_RECUSAL_BOUNDS,
  CONFLICT_RECUSAL_DEFAULTS,
  CONFLICT_RECUSAL_SETTING_KEYS,
  CONFLICT_SOURCE_KEYS,
  CONFLICT_STANDING_KIND_KEYS,
  CONFLICT_STANDING_KIND_BY_KEY,
  CONFLICT_SUBJECT_KEYS,
} from './conflictRecusalRegistry.js';

const L = CONFLICT_RECUSAL_LIMITS;
const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const SIGNATURE_RE = /^cir1:[0-9a-f]{16}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const idOf = (value) => { const c = text(value, 120); return ID_RE.test(c) ? c : null; };

/** A real calendar day, `YYYY-MM-DD`, or null. */
export function conflictDay(value) {
  const candidate = text(value, 10);
  if (!DAY_RE.test(candidate)) return null;
  const time = Date.parse(`${candidate}T00:00:00.000Z`);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString().slice(0, 10) === candidate ? candidate : null;
}

function stamp(value) {
  const raw = text(value, 40);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function boundedInt(value, [min, max], fallback) {
  const n = Math.round(Number(value));
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function conflictTitle(value) {
  const candidate = text(value, L.titleMax);
  return candidate.length >= L.titleMin ? candidate : null;
}

export function conflictReason(value) {
  const candidate = text(value, L.reasonMax);
  return candidate.length >= L.reasonMin ? candidate : null;
}

export function conflictSourceText(value) {
  const candidate = text(value, L.sourceMax);
  return candidate.length >= L.sourceMin ? candidate : null;
}

/* ------------------------------------------------------------- conventions */

export function normalizeConflictRecusalSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const out = {};
  out[CONFLICT_RECUSAL_SETTING_KEYS.backDays] = boundedInt(src[CONFLICT_RECUSAL_SETTING_KEYS.backDays], CONFLICT_RECUSAL_BOUNDS.backDays, CONFLICT_RECUSAL_DEFAULTS.backDays);
  out[CONFLICT_RECUSAL_SETTING_KEYS.lateDays] = boundedInt(src[CONFLICT_RECUSAL_SETTING_KEYS.lateDays], CONFLICT_RECUSAL_BOUNDS.lateDays, CONFLICT_RECUSAL_DEFAULTS.lateDays);
  out[CONFLICT_RECUSAL_SETTING_KEYS.autoPropagate] = src[CONFLICT_RECUSAL_SETTING_KEYS.autoPropagate] !== false;
  return out;
}

/**
 * The declared conventions, read with their defaults. A hand-edited value out
 * of bounds is CLAMPED here (it is a convention, not a record) and the clamp is
 * the value every reader uses — the same reading the door writes.
 */
export function readConflictRecusalSettings(state) {
  return normalizeConflictRecusalSettings(state?.settings || {});
}

/* --------------------------------------------------------------- interests */

/**
 * One declared interest. `subjectType` + `subjectId` name a record this
 * workspace holds; `personId` is the person who HOLDS the stake;
 * `relationship` is a closed key; `direction` is a fact of the declaration and
 * defaults to the relationship's own typical direction, which is why it is
 * stored rather than inferred on read.
 */
export function normalizeConflictInterests(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Conflict/recusal: the interest ledger was not an array; it was read as empty.');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.interests) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const interestId = row && idOf(row.id);
    const personId = row && idOf(row.personId);
    const subjectType = row && CONFLICT_SUBJECT_KEYS.includes(row.subjectType) ? row.subjectType : null;
    const subjectId = row && idOf(row.subjectId);
    const relationship = row && CONFLICT_RELATIONSHIP_KEYS.includes(row.relationship) ? row.relationship : null;
    const direction = row && CONFLICT_DIRECTION_KEYS.includes(row.direction)
      ? row.direction
      : (relationship ? CONFLICT_RELATIONSHIP_BY_KEY[relationship].defaultDirection : null);
    const relatedToId = row && row.relatedToId ? idOf(row.relatedToId) : null;
    const becameKnownOn = row && conflictDay(row.becameKnownOn);
    const declaredOn = row && conflictDay(row.declaredOn);
    const declaredAt = row && stamp(row.declaredAt);
    const declaredById = row && idOf(row.declaredById);
    const source = row && CONFLICT_SOURCE_KEYS.includes(row.source) ? row.source : null;
    const note = row ? text(row.note, L.reasonMax) : '';
    const withdrawnOn = row && row.withdrawnOn ? conflictDay(row.withdrawnOn) : null;
    const withdrawnById = row && row.withdrawnById ? idOf(row.withdrawnById) : null;
    const withdrawalReason = row ? text(row.withdrawalReason, L.reasonMax) : '';
    if (!interestId || seen.has(interestId) || !personId || !subjectType || !subjectId || !relationship
      || !direction || !becameKnownOn || !declaredOn || !declaredAt || !declaredById || !source) {
      dropped += 1;
      continue;
    }
    // A withdrawal is whole or absent: a day without an author, or a reason
    // without a day, is an unreadable half-act and is dropped with the row.
    if ((withdrawnOn && !withdrawnById) || (withdrawnById && !withdrawnOn) || (withdrawalReason && !withdrawnOn)) {
      dropped += 1;
      continue;
    }
    seen.add(interestId);
    out.push({
      id: interestId,
      personId,
      subjectType,
      subjectId,
      relationship,
      direction,
      relatedToId,
      becameKnownOn,
      declaredOn,
      declaredAt,
      declaredById,
      source,
      note,
      withdrawnOn,
      withdrawnById,
      withdrawalReason,
    });
  }
  if (dropped) warnings.push(`Conflict/recusal: ${dropped} interest row(s) could not be read exactly and were dropped.`);
  return out;
}

/* ------------------------------------------------------- no-interest declarations */

/**
 * A dated first-person statement that a person holds NO reportable interest in
 * one record, naming the relationship kinds it covers. This is the ONLY thing
 * that turns "nobody looked" into "asked, and clear" — which is why it is a
 * stored act with a day and an author, not a checkbox on a screen.
 *
 * `personId` is the person the statement is ABOUT and `declaredById` the person
 * who made it. They must be the same: a declaration of no-interest is first
 * person or it is not a declaration. The loader refuses any row where they
 * differ rather than repairing it into somebody's own word.
 */
export function normalizeConflictNoneDeclarations(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Conflict/recusal: the no-interest declarations were not an array; they were read as empty.');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= CONFLICT_RECUSAL_LIMITS.declarations) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const declarationId = row && idOf(row.id);
    const personId = row && idOf(row.personId);
    const subjectType = row && CONFLICT_SUBJECT_KEYS.includes(row.subjectType) ? row.subjectType : null;
    const subjectId = row && idOf(row.subjectId);
    const kinds = row && Array.isArray(row.relationships)
      ? [...new Set(row.relationships.filter((key) => CONFLICT_RELATIONSHIP_KEYS.includes(key)))].sort()
      : [];
    const declaredOn = row && conflictDay(row.declaredOn);
    const declaredAt = row && stamp(row.declaredAt);
    const declaredById = row && idOf(row.declaredById);
    const withdrawnOn = row && row.withdrawnOn ? conflictDay(row.withdrawnOn) : null;
    const withdrawnById = row && row.withdrawnById ? idOf(row.withdrawnById) : null;
    // First person or nothing: a statement about somebody ELSE's stake is a
    // disclosure, which is a different act with a different route.
    if (!declarationId || seen.has(declarationId) || !personId || !subjectType || !subjectId || !kinds.length
      || !declaredOn || !declaredAt || !declaredById || declaredById !== personId) {
      dropped += 1;
      continue;
    }
    if ((withdrawnOn && !withdrawnById) || (withdrawnById && !withdrawnOn)) { dropped += 1; continue; }
    seen.add(declarationId);
    out.push({ id: declarationId, personId, subjectType, subjectId, relationships: kinds, note: row ? text(row.note, CONFLICT_RECUSAL_LIMITS.reasonMax) : '', declaredOn, declaredAt, declaredById, withdrawnOn, withdrawnById });
  }
  if (dropped) warnings.push(`Conflict/recusal: ${dropped} no-interest declaration(s) could not be read exactly and were dropped.`);
  return out;
}

/* --------------------------------------------------------------- standings */

/**
 * One standing record against one interest: what was done about it, who
 * authorised the handling, on what day, and — for a recusal or a mitigation —
 * the control that stands in, in writing.
 *
 * `supersedesId` names an EARLIER standing of the SAME interest. The earlier
 * row is never edited or removed; it stays on the record and the register
 * prints the chain.
 */
export function normalizeConflictStandings(value, interests = [], warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Conflict/recusal: the standing ledger was not an array; it was read as empty.');
    return [];
  }
  const interestIds = new Set(interests.map((row) => row.id));
  const out = [];
  const seen = new Set();
  const perInterest = new Map();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.standings) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const standingId = row && idOf(row.id);
    const interestId = row && idOf(row.interestId);
    const kind = row && CONFLICT_STANDING_KIND_KEYS.includes(row.kind) ? row.kind : null;
    const authorityId = row && idOf(row.authorityId);
    const recordedOn = row && conflictDay(row.recordedOn);
    const recordedAt = row && stamp(row.recordedAt);
    const recordedById = row && idOf(row.recordedById);
    const reason = row ? conflictReason(row.reason) : null;
    const control = row ? text(row.control, L.reasonMax) : '';
    const supersedesId = row && row.supersedesId ? idOf(row.supersedesId) : null;
    if (!standingId || seen.has(standingId) || !interestId || !interestIds.has(interestId) || !kind
      || !authorityId || !recordedOn || !recordedAt || !recordedById || !reason) {
      dropped += 1;
      continue;
    }
    // A recusal or a mitigation must name the control that stands in; a
    // determination and a supersession must not invent one.
    const spec = CONFLICT_STANDING_KIND_BY_KEY[kind];
    if (spec.needsControl && text(control, L.reasonMax).length < L.reasonMin) { dropped += 1; continue; }
    if (supersedesId === standingId) { dropped += 1; continue; }
    const used = perInterest.get(interestId) || 0;
    if (used >= L.standingsPerInterest) { dropped += 1; continue; }
    perInterest.set(interestId, used + 1);
    seen.add(standingId);
    out.push({ id: standingId, interestId, kind, authorityId, recordedOn, recordedAt, recordedById, reason, control: text(control, L.reasonMax), supersedesId });
  }
  // A supersession must point at an EARLIER standing of the SAME interest. One
  // that does not resolves to null rather than being invented here.
  const byId = new Map(out.map((row) => [row.id, row]));
  for (const row of out) {
    if (!row.supersedesId) continue;
    const target = byId.get(row.supersedesId);
    row.supersedesId = target && target.interestId === row.interestId ? target.id : null;
  }
  if (dropped) warnings.push(`Conflict/recusal: ${dropped} standing row(s) could not be read exactly and were dropped.`);
  return out;
}

/* ------------------------------------------------------------------- rules */

/**
 * A declared rule: which relationship kinds a seat above this person's altitude
 * must have ASKED about, from what day. `appliesTo` is a rank floor, not a list
 * of names — a rule says "every seat at director and above", which is a
 * statement about the organisation rather than about people, and it cannot be
 * quietly narrowed to exclude one person.
 */
export function normalizeConflictRules(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Conflict/recusal: the rule ledger was not an array; it was read as empty.');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.rules) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const ruleId = row && idOf(row.id);
    const kinds = row && Array.isArray(row.relationships)
      ? [...new Set(row.relationships.filter((key) => CONFLICT_RELATIONSHIP_KEYS.includes(key)))].sort()
      : [];
    const minRank = row && Number.isInteger(row.minRank) && row.minRank >= 1 && row.minRank <= 6 ? row.minRank : null;
    const effectiveFrom = row && conflictDay(row.effectiveFrom);
    const retiredOn = row && row.retiredOn ? conflictDay(row.retiredOn) : null;
    const source = row && conflictSourceText(row.sourceNote);
    const declaredOn = row && conflictDay(row.declaredOn);
    const declaredAt = row && stamp(row.declaredAt);
    const declaredById = row && idOf(row.declaredById);
    if (!ruleId || seen.has(ruleId) || !kinds.length || kinds.length > L.kindsPerRule || !minRank
      || !effectiveFrom || !source || !declaredOn || !declaredAt || !declaredById) {
      dropped += 1;
      continue;
    }
    seen.add(ruleId);
    out.push({ id: ruleId, relationships: kinds, minRank, effectiveFrom, retiredOn, sourceNote: source, declaredOn, declaredAt, declaredById });
  }
  if (dropped) warnings.push(`Conflict/recusal: ${dropped} rule row(s) could not be read exactly and were dropped.`);
  return out;
}

/* --------------------------------------------------------------- markers */

export function normalizeConflictRecusalMarkers(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Conflict/recusal: the observation markers were not an array; they were read as empty.');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.markers) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const key = row ? text(row.key, 240) : '';
    const at = row && stamp(row.at);
    const kind = row && text(row.kind, 60);
    const detail = row ? text(row.detail, 300) : '';
    if (!key || seen.has(key) || !at || !kind) { dropped += 1; continue; }
    seen.add(key);
    out.push({ key, at, ruleId: text(row.ruleId, 40), kind, detail });
  }
  if (dropped) warnings.push(`Conflict/recusal: ${dropped} observation marker(s) could not be read and were dropped.`);
  return out;
}

/* ------------------------------------------------------------ the ask spine */

/**
 * A deterministic signature for one unhandled interest, so the rule can be
 * idempotent across every trigger: `cir1:<16 hex>` over the interest id and the
 * standing-state it was found in. It carries no person, no record id and no
 * title, because it is printed on the panel and exported.
 */
export function conflictRecusalSignature(basis) {
  const source = `cir1|${String(basis.interestId || '')}|${String(basis.state || '')}`;
  let h1 = 0xdeadbeef ^ source.length;
  let h2 = 0x41c6ce57 ^ source.length;
  for (let k = 0; k < source.length; k += 1) {
    const ch = source.charCodeAt(k);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
  return `cir1:${hex(h2)}${hex(h1)}`;
}

export function conflictRecusalAskSummary(signature) {
  return `${CONFLICT_RECUSAL_ASK_SUMMARY_PREFIX}${signature}`;
}

export function parseConflictRecusalAskSummary(summary) {
  const raw = text(summary, 200);
  if (!raw.startsWith(CONFLICT_RECUSAL_ASK_SUMMARY_PREFIX)) return null;
  const signature = raw.slice(CONFLICT_RECUSAL_ASK_SUMMARY_PREFIX.length).trim();
  return SIGNATURE_RE.test(signature) ? signature : null;
}

export const CONFLICT_RECUSAL_ASK_SUMMARY_PREFIX = 'cir1-ask:';

export function isConflictSignature(value) {
  return SIGNATURE_RE.test(text(value, 40));
}
