/**
 * app/core/domain/workRestSchema.js — the storage contract of the Work/Rest
 * Recovery Ledger (ADR-0209, Schema v163).
 *
 * Five collections, all EMPTY at upgrade: `workRestShifts`, `workRestActs`,
 * `workRestCoverage`, `workRestPolicies` and the rule's `workRestMarkers`.
 * Nothing derived is stored — no spell, no rest, no total, no verdict.
 *
 * FAIL CLOSED. A row that cannot be read exactly is dropped with a counted
 * warning and never repaired: a shift whose end is not after its start is not
 * "probably an overnight shift", it is unreadable. An amendment is admitted
 * only through its shift's own lifecycle, so a hand-edited file cannot amend a
 * cancelled shift or an unknown one.
 */

import {
  WORK_REST_ACT_KINDS,
  WORK_REST_ASK_PREFIX,
  WORK_REST_BOUNDS,
  WORK_REST_DEFAULTS,
  WORK_REST_LIMITS,
  WORK_REST_POLICY_SCOPES,
  WORK_REST_ROUTE_KEYS,
  WORK_REST_SETTING_KEYS,
  WORK_REST_SOURCE_KEYS,
  WORK_REST_THRESHOLD_BOUNDS,
  WORK_REST_THRESHOLD_FIELDS,
} from './workRestRegistry.js';
import { dayStartMinutes, instantMinutes, parseWallTime } from './workRestTime.js';

const L = WORK_REST_LIMITS;
const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const ZONE_RE = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/;
const SIGNATURE_RE = /^wrr1:[0-9a-f]{16}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const id = (value) => { const c = text(value, 120); return ID_RE.test(c) ? c : null; };

export function workRestDay(value) {
  const candidate = text(value, 10);
  return dayStartMinutes(candidate) === null ? null : candidate;
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

export function workRestReason(value) {
  const candidate = text(value, L.reasonMax);
  return candidate.length >= L.reasonMin ? candidate : null;
}

export function workRestLabel(value) {
  const candidate = text(value, L.labelMax + 20).replace(/\s+/g, ' ').trim();
  return candidate.length >= L.labelMin ? candidate.slice(0, L.labelMax) : null;
}

export function workRestZone(value) {
  const candidate = text(value, 64);
  return ZONE_RE.test(candidate) ? candidate : null;
}

const offset = (value) => (Number.isInteger(value) && value >= L.offsetMin && value <= L.offsetMax ? value : null);

/**
 * One pair of stored ends → instants, or the reason it cannot be read.
 * Shared by the loader and the door, so the door can never admit a shift the
 * loader would then drop.
 */
export function readShiftSpan({ start, end, startOffsetMin, endOffsetMin }) {
  const a = parseWallTime(start);
  const b = parseWallTime(end);
  if (!a || !b) return { ok: false, error: 'a start or end that is not a real wall-clock time' };
  if (a.y < L.yearMin || a.y > L.yearMax || b.y < L.yearMin || b.y > L.yearMax) return { ok: false, error: `a year outside ${L.yearMin}–${L.yearMax}` };
  if (offset(startOffsetMin) === null || offset(endOffsetMin) === null) return { ok: false, error: 'a UTC offset that is not a whole number of minutes inside the range any zone uses' };
  const s = instantMinutes(a.text, startOffsetMin);
  const e = instantMinutes(b.text, endOffsetMin);
  if (!(e > s)) return { ok: false, error: 'an end that is not after its start' };
  if (e - s < L.shiftMinMinutes) return { ok: false, error: `a length under ${L.shiftMinMinutes} minutes` };
  if (e - s > L.shiftMaxMinutes) return { ok: false, error: `a length over ${L.shiftMaxMinutes / 60} hours — that is not one shift` };
  return { ok: true, start: a.text, end: b.text, startOffsetMin, endOffsetMin, s, e, minutes: e - s };
}

/* ----------------------------------------------------------------- settings */

/** The loader clamps into the declared bounds; the setter (in the actions) refuses. */
export function normalizeWorkRestSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = WORK_REST_SETTING_KEYS;
  return {
    [K.backDays]: boundedInt(src[K.backDays], WORK_REST_BOUNDS.backDays, WORK_REST_DEFAULTS.backDays),
    [K.aheadDays]: boundedInt(src[K.aheadDays], WORK_REST_BOUNDS.aheadDays, WORK_REST_DEFAULTS.aheadDays),
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

/* ------------------------------------------------------------------- shifts */

/** Every declared shift, read exactly or dropped. Order: start instant, then id. */
export function normalizeWorkRestShifts(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Work/rest: the shift ledger was not an array; it was read as empty.');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.shifts) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const shiftId = row && id(row.id);
    const personId = row && id(row.personId);
    const lineManagerId = row && id(row.lineManagerId);
    const zone = row && workRestZone(row.zone);
    const span = row ? readShiftSpan(row) : { ok: false };
    const source = row && WORK_REST_SOURCE_KEYS.includes(row.source) ? row.source : null;
    const declaredOn = row && workRestDay(row.declaredOn);
    const declaredAt = row && stamp(row.declaredAt);
    const declaredById = row && id(row.declaredById);
    const via = row && WORK_REST_ROUTE_KEYS.includes(row.via) ? row.via : null;
    if (!shiftId || seen.has(shiftId) || !personId || !lineManagerId || personId === lineManagerId || !zone || !span.ok
      || !source || !declaredOn || !declaredAt || !declaredById || !via) {
      dropped += 1;
      continue;
    }
    seen.add(shiftId);
    out.push({
      id: shiftId, personId, lineManagerId, zone,
      start: span.start, end: span.end, startOffsetMin: span.startOffsetMin, endOffsetMin: span.endOffsetMin,
      source, note: text(row.note, L.reasonMax), declaredOn, declaredAt, declaredById, via,
    });
  }
  if (dropped) warnings.push(`${dropped} work/rest shift row(s) could not be read exactly — an unreadable person, line, zone, wall time or offset, an end that is not after its start, or a length that is not one shift — and were dropped. Nothing was repaired.`);
  out.sort((a, b) => instantMinutes(a.start, a.startOffsetMin) - instantMinutes(b.start, b.startOffsetMin) || a.id.localeCompare(b.id));
  return out;
}

/* --------------------------------------------------------------------- acts */

/** Amendments, admitted only through their shift's lifecycle. Order: act time, then position. */
export function normalizeWorkRestActs(value, shifts = [], warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Work/rest: the amendment ledger was not an array; it was read as empty.');
    return [];
  }
  const life = new Map(shifts.map((row) => [row.id, { cancelled: false, n: 0 }]));
  const ordered = value
    .map((raw, index) => ({ raw, index, at: isPlainObject(raw) ? stamp(raw.actedAt) : null }))
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')) || a.index - b.index);
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const { raw, at } of ordered) {
    if (out.length >= L.acts) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const actId = row && id(row.id);
    const shiftId = row && id(row.shiftId);
    const kind = row && WORK_REST_ACT_KINDS.includes(row.kind) ? row.kind : null;
    const actedOn = row && workRestDay(row.actedOn);
    const actedById = row && id(row.actedById);
    const via = row && WORK_REST_ROUTE_KEYS.includes(row.via) ? row.via : null;
    const state = shiftId ? life.get(shiftId) : null;
    if (!actId || seen.has(actId) || !state || !kind || !at || !actedOn || !actedById || !via || state.cancelled || state.n >= L.actsPerShift) { dropped += 1; continue; }
    const reason = workRestReason(row.reason);
    const base = { id: actId, shiftId, kind, actedOn, actedAt: at, actedById, via, reason: reason || '' };
    if (kind === 'cancel') {
      if (!reason) { dropped += 1; continue; }
      state.cancelled = true;
      state.n += 1;
      seen.add(actId);
      out.push(base);
      continue;
    }
    const span = readShiftSpan(row);
    if (!span.ok) { dropped += 1; continue; }
    state.n += 1;
    seen.add(actId);
    out.push({ ...base, start: span.start, end: span.end, startOffsetMin: span.startOffsetMin, endOffsetMin: span.endOffsetMin });
  }
  if (dropped) warnings.push(`${dropped} work/rest amendment row(s) were unreadable, named a shift that is not on the record, followed a cancellation, or exceeded ${L.actsPerShift} amendments for one shift, and were dropped.`);
  return out;
}

/**
 * Every shift as it is READ today: the latest amendment's times when there is
 * one, the rostered times otherwise. `confirmed` is true when the times were
 * recorded after the fact — an actual-times amendment, or a shift declared at or
 * after its own end. It is a statement about the RECORD, never about the person.
 */
export function readEffectiveShifts(shifts, acts) {
  const latest = new Map();
  const counts = new Map();
  for (const act of acts) {
    latest.set(act.shiftId, act);
    counts.set(act.shiftId, (counts.get(act.shiftId) || 0) + 1);
  }
  return shifts.map((shift) => {
    const act = latest.get(shift.id) || null;
    const cancelled = Boolean(act && act.kind === 'cancel');
    const amended = Boolean(act && act.kind === 'actual');
    const ends = amended ? act : shift;
    const s = instantMinutes(ends.start, ends.startOffsetMin);
    const e = instantMinutes(ends.end, ends.endOffsetMin);
    const declaredMin = Math.floor(Date.parse(shift.declaredAt) / 60000);
    const confirmed = amended || declaredMin >= e;
    return {
      ...shift,
      effStart: ends.start, effEnd: ends.end, effStartOffsetMin: ends.startOffsetMin, effEndOffsetMin: ends.endOffsetMin,
      s, e, minutes: e - s,
      state: cancelled ? 'cancelled' : confirmed ? 'worked' : 'planned',
      cancelled, amended, confirmed,
      actsN: counts.get(shift.id) || 0,
      lastAct: act,
    };
  });
}

/* ----------------------------------------------------------------- coverage */

export function normalizeWorkRestCoverage(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Work/rest: the coverage ledger was not an array; it was read as empty.');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.coverage) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const rowId = row && id(row.id);
    const personId = row && id(row.personId);
    const lineManagerId = row && id(row.lineManagerId);
    const fromDay = row && workRestDay(row.fromDay);
    const toDay = row && workRestDay(row.toDay);
    const attestedOn = row && workRestDay(row.attestedOn);
    const attestedAt = row && stamp(row.attestedAt);
    const attestedById = row && id(row.attestedById);
    const via = row && WORK_REST_ROUTE_KEYS.includes(row.via) ? row.via : null;
    const withdrawnAt = row && row.withdrawnAt ? stamp(row.withdrawnAt) : null;
    const withdrawnBy = row && row.withdrawnBy ? id(row.withdrawnBy) : null;
    const days = fromDay && toDay ? (dayStartMinutes(toDay) - dayStartMinutes(fromDay)) / 1440 + 1 : 0;
    if (!rowId || seen.has(rowId) || !personId || !lineManagerId || personId === lineManagerId || !fromDay || !toDay || days < 1 || days > L.coverageMaxDays
      || !attestedOn || !attestedAt || !attestedById || !via
      || (row.withdrawnAt && !withdrawnAt) || Boolean(withdrawnAt) !== Boolean(withdrawnBy)) {
      dropped += 1;
      continue;
    }
    seen.add(rowId);
    out.push({
      id: rowId, personId, lineManagerId, fromDay, toDay, attestedOn, attestedAt, attestedById, via,
      withdrawnAt, withdrawnBy, withdrawReason: withdrawnAt ? text(row.withdrawReason, L.reasonMax) : '',
    });
  }
  if (dropped) warnings.push(`${dropped} work/rest coverage row(s) were unreadable, named no line, ran backwards, covered more than ${L.coverageMaxDays} days or carried half a withdrawal, and were dropped.`);
  return out;
}

/* ----------------------------------------------------------------- policies */

/**
 * The thresholds of a policy, read exactly: each field null or a whole number of
 * minutes inside its declared bounds; paired fields declared together; at least
 * one threshold; a cap that does not exceed its own window. Returns the reason
 * when it cannot be read.
 */
export function readWorkRestThresholds(src) {
  const out = {};
  for (const field of WORK_REST_THRESHOLD_FIELDS) {
    const value = src?.[field];
    if (value === null || value === undefined || value === '') { out[field] = null; continue; }
    const [min, max] = WORK_REST_THRESHOLD_BOUNDS[field];
    if (!Number.isInteger(value) || value < min || value > max) return { ok: false, field, error: `must be a whole number of minutes from ${min} to ${max}` };
    out[field] = value;
  }
  if ((out.longRestMin === null) !== (out.longRestWithinMin === null)) {
    return { ok: false, field: out.longRestMin === null ? 'longRestMin' : 'longRestWithinMin', error: 'is half of a pair: a long rest needs both its length and the time within which it must begin' };
  }
  if ((out.workCapMin === null) !== (out.workCapWindowMin === null)) {
    return { ok: false, field: out.workCapMin === null ? 'workCapMin' : 'workCapWindowMin', error: 'is half of a pair: a rolling cap needs both its total and the length of its window' };
  }
  if (out.workCapMin !== null && out.workCapMin > out.workCapWindowMin) return { ok: false, field: 'workCapMin', error: 'is larger than its own window — a cap nothing can reach tests nothing' };
  if (WORK_REST_THRESHOLD_FIELDS.every((field) => out[field] === null)) return { ok: false, field: 'minRestMin', error: 'is missing, and so is every other threshold: a policy that declares no limit tests nothing' };
  return { ok: true, thresholds: out };
}

export function normalizeWorkRestPolicies(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Work/rest: the policy ledger was not an array; it was read as empty.');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.policies) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const policyId = row && id(row.id);
    const label = row && workRestLabel(row.label);
    const scope = row && WORK_REST_POLICY_SCOPES.includes(row.scope) ? row.scope : null;
    const source = row && workRestReason(row.source);
    const read = row ? readWorkRestThresholds(row) : { ok: false };
    const declaredOn = row && workRestDay(row.declaredOn);
    const declaredAt = row && stamp(row.declaredAt);
    const declaredById = row && id(row.declaredById);
    const rawPeople = row && Array.isArray(row.personIds) ? row.personIds : [];
    const personIds = [...new Set(rawPeople.map(id).filter(Boolean))].sort();
    const retiredAt = row && row.retiredAt ? stamp(row.retiredAt) : null;
    const retiredById = row && row.retiredById ? id(row.retiredById) : null;
    if (!policyId || seen.has(policyId) || !label || !scope || !source || !read.ok || !declaredOn || !declaredAt || !declaredById
      || personIds.length !== rawPeople.length || personIds.length > L.peoplePerPolicy
      || (scope === 'people' && !personIds.length) || (scope === 'workspace' && personIds.length)
      || (row.retiredAt && !retiredAt) || Boolean(retiredAt) !== Boolean(retiredById)) {
      dropped += 1;
      continue;
    }
    seen.add(policyId);
    out.push({
      id: policyId, label, scope, personIds, source, ...read.thresholds, declaredOn, declaredAt, declaredById,
      retiredAt, retiredById, retireReason: retiredAt ? text(row.retireReason, L.reasonMax) : '',
    });
  }
  if (dropped) warnings.push(`${dropped} work/rest policy row(s) could not be read exactly — no written source, a threshold outside its bounds, half a pair, no threshold at all, or a scope that does not match its people — and were dropped. No limit was assumed in their place.`);
  out.sort((a, b) => a.declaredAt.localeCompare(b.declaredAt) || a.id.localeCompare(b.id));
  return out;
}

/** The rule's bounded idempotency ledger. Identity-free, keyed by signature. */
export function normalizeWorkRestMarkers(value, warnings = []) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    const row = isPlainObject(raw) ? raw : null;
    const key = row ? text(row.key, 220) : '';
    if (!key || seen.has(key)) { dropped += 1; continue; }
    seen.add(key);
    out.push({ key, at: stamp(row.at), ruleId: text(row.ruleId, 40), kind: text(row.kind, 40), detail: text(row.detail, 300) });
  }
  if (dropped) warnings.push(`${dropped} work/rest marker row(s) were unreadable or duplicated and were dropped.`);
  return out.slice(-L.markers);
}

/* --------------------------------------------------------------- signatures */

/**
 * One conflict, named deterministically: the person, the kind, the decisive
 * minute and the shifts that make it. Moving a shift changes the signature, so
 * the old ask closes and a new one is filed for the new conflict — if any.
 */
export function workRestSignature({ personId, kind, at, ids }) {
  const joined = `person:${personId || ''}\nkind:${kind || ''}\nat:${at}\nids:${[...(ids || [])].sort().join(',')}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < joined.length; i += 1) {
    const code = joined.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (code ^ (i & 0xff));
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return `wrr1:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function workRestAskSummary(signature) {
  return `${WORK_REST_ASK_PREFIX}${String(signature || '').trim()}`;
}

export function parseWorkRestAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const trimmed = summary.trim();
  if (!trimmed.startsWith(WORK_REST_ASK_PREFIX)) return null;
  const signature = trimmed.slice(WORK_REST_ASK_PREFIX.length).trim();
  return SIGNATURE_RE.test(signature) ? { signature } : null;
}
