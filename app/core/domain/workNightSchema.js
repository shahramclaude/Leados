/**
 * app/core/domain/workNightSchema.js — the storage contract of the Night-Work
 * & In-Shift Break Reading (ADR-0226, Schema v181).
 *
 * Three collections, all EMPTY at upgrade: `workBreaks`, `workNightPolicies`
 * and the rule's `workNightMarkers`. Nothing derived is stored — no night
 * minutes, no share, no streak, no continuous stretch, no verdict.
 *
 * FAIL CLOSED. A row that cannot be read exactly is dropped with a counted
 * warning and never repaired: a break that does not lie inside its shift is
 * not "probably part of the shift", it is unreadable. A policy with no written
 * source, a night window that is not a range, or half a declaration is dropped
 * and NO limit is assumed in its place.
 */

import {
  WORK_NIGHT_ASK_PREFIX,
  WORK_NIGHT_LIMITS,
  WORK_NIGHT_POLICY_SCOPES,
  WORK_NIGHT_ROUTE_KEYS,
  WORK_NIGHT_THRESHOLD_BOUNDS,
  WORK_NIGHT_THRESHOLD_FIELDS,
} from './workNightRegistry.js';
import { instantMinutes, parseWallTime } from './workRestTime.js';

const L = WORK_NIGHT_LIMITS;
const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const SIGNATURE_RE = /^wnr1:[0-9a-f]{16}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const id = (value) => { const c = text(value, 120); return ID_RE.test(c) ? c : null; };

function stamp(value) {
  const raw = text(value, 40);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function workNightReason(value) {
  const candidate = text(value, L.reasonMax);
  return candidate.length >= L.reasonMin ? candidate : null;
}

export function workNightLabel(value) {
  const candidate = text(value, L.labelMax + 20).replace(/\s+/g, ' ').trim();
  return candidate.length >= L.labelMin ? candidate.slice(0, L.labelMax) : null;
}

const boundedInt = (value, [min, max]) => {
  const n = Math.round(Number(value));
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return null;
  return (Number.isInteger(n) && n >= min && n <= max) ? n : null;
};

/**
 * The night window read exactly: two whole minute-of-day values, different,
 * each inside 0–1439. A window that starts and ends on the same minute is not
 * a window; one outside the day is refused, never clamped.
 */
export function readNightWindow(src) {
  const fromMin = boundedInt(src?.nightFromMin, WORK_NIGHT_THRESHOLD_BOUNDS.nightFromMin);
  const toMin = boundedInt(src?.nightToMin, WORK_NIGHT_THRESHOLD_BOUNDS.nightToMin);
  if (fromMin === null || toMin === null) return { ok: false, field: fromMin === null ? 'nightFromMin' : 'nightToMin', error: 'must be a whole minute of the day, 0 to 1439' };
  if (fromMin === toMin) return { ok: false, field: 'nightToMin', error: 'must differ from the start of the window — a window that starts and ends on the same minute is not a window' };
  return { ok: true, nightFromMin: fromMin, nightToMin: toMin };
}

/**
 * The limits of a night policy, read exactly: each field null or a whole number
 * inside its declared bounds; the window declared; at least one limit.
 * Returns the reason when it cannot be read.
 */
export function readWorkNightThresholds(src) {
  const window = readNightWindow(src);
  if (!window.ok) return { ok: false, field: window.field, error: window.error };
  const out = { nightFromMin: window.nightFromMin, nightToMin: window.nightToMin };
  for (const field of WORK_NIGHT_THRESHOLD_FIELDS) {
    if (field === 'nightFromMin' || field === 'nightToMin') continue;
    const value = src?.[field];
    if (value === null || value === undefined || value === '') { out[field] = null; continue; }
    const [min, max] = WORK_NIGHT_THRESHOLD_BOUNDS[field];
    if (!Number.isInteger(value) || value < min || value > max) return { ok: false, field, error: `must be a whole number from ${min} to ${max}` };
    out[field] = value;
  }
  const limitFields = WORK_NIGHT_THRESHOLD_FIELDS.filter((field) => field !== 'nightFromMin' && field !== 'nightToMin');
  if (limitFields.every((field) => out[field] === null)) return { ok: false, field: 'nightMaxSharePct', error: 'is missing, and so is every other limit: a policy that declares no limit tests nothing' };
  return { ok: true, thresholds: out };
}

/* ----------------------------------------------------------------- settings */

/** The night module adds only its automation switch; the horizon is shared. */
export function normalizeWorkNightSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  return { workNightAutoPropagate: src.workNightAutoPropagate !== false };
}

/* ------------------------------------------------------------------ breaks */

/**
 * A break lies inside its shift when every wall minute of the break is a wall
 * minute of the shift's coverage. Read from the stored wall times alone — the
 * same set the reader computes — so the door and the loader agree by
 * construction.
 */
export function breakInsideShift(breakRow, shift) {
  const start = parseWallTime(breakRow.start);
  const end = parseWallTime(breakRow.end);
  if (!start || !end) return false;
  const startMin = Math.floor(start.wallMin % 1440);
  const endMin = Math.floor(end.wallMin % 1440);
  const shiftStart = Math.floor(parseWallTime(shift.effStart).wallMin % 1440);
  const shiftEnd = Math.floor(parseWallTime(shift.effEnd).wallMin % 1440);
  const shiftSet = new Set();
  if (shiftEnd >= shiftStart) {
    for (let m = shiftStart; m < shiftEnd; m += 1) shiftSet.add(m);
  } else {
    for (let m = shiftStart; m < 1440; m += 1) shiftSet.add(m);
    for (let m = 0; m < shiftEnd; m += 1) shiftSet.add(m);
  }
  if (endMin >= startMin) {
    for (let m = startMin; m < endMin; m += 1) if (!shiftSet.has(m)) return false;
  } else {
    for (let m = startMin; m < 1440; m += 1) if (!shiftSet.has(m)) return false;
    for (let m = 0; m < endMin; m += 1) if (!shiftSet.has(m)) return false;
  }
  return true;
}

/**
 * Declared breaks, read exactly. A break is admitted only through a shift that
 * exists and is not cancelled, must name that shift's own person and line, must
 * lie inside the shift as read today, and must not be shorter than the
 * governing policy's declared break minimum (a record that fails its own
 * standard is dropped, never repaired). Order: shift start, then break start.
 */
export function normalizeWorkNightBreaks(value, shifts = [], policies = [], warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Night-work: the break ledger was not an array; it was read as empty.');
    return [];
  }
  const byId = new Map(shifts.map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.breaks) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const breakId = row && id(row.id);
    const shiftId = row && id(row.shiftId);
    const shift = shiftId ? byId.get(shiftId) : null;
    if (!breakId || seen.has(breakId) || !shift || shift.cancelled) { dropped += 1; continue; }
    const personId = row && id(row.personId);
    const lineManagerId = row && id(row.lineManagerId);
    if (!personId || !lineManagerId || personId !== shift.personId || lineManagerId !== shift.lineManagerId) { dropped += 1; continue; }
    const start = parseWallTime(text(row.start, 20));
    const end = parseWallTime(text(row.end, 20));
    const startOffsetMin = Number.isInteger(row.startOffsetMin) ? row.startOffsetMin : null;
    const endOffsetMin = Number.isInteger(row.endOffsetMin) ? row.endOffsetMin : null;
    if (!start || !end || startOffsetMin === null || endOffsetMin === null) { dropped += 1; continue; }
    const s = instantMinutes(start.text, startOffsetMin);
    const e = instantMinutes(end.text, endOffsetMin);
    if (!(e > s)) { dropped += 1; continue; }
    if (!breakInsideShift({ start: start.text, end: end.text }, shift)) { dropped += 1; continue; }
    // A break shorter than the governing policy's declared minimum cannot
    // support the standard it was declared under: dropped, never repaired.
    const governing = policies.filter((policy) => policy && typeof policy === 'object' && !policy.retiredAt)
      .find((policy) => policy.scope === 'workspace')
      || policies.filter((policy) => policy && typeof policy === 'object' && !policy.retiredAt)
        .find((policy) => policy.scope === 'people' && policy.personIds.includes(personId));
    if (governing && Number.isInteger(governing.breakMinMin) && (e - s) < governing.breakMinMin) { dropped += 1; continue; }
    const declaredOn = row && text(row.declaredOn, 10);
    const declaredAt = row && stamp(row.declaredAt);
    const declaredById = row && id(row.declaredById);
    const via = row && WORK_NIGHT_ROUTE_KEYS.includes(row.via) ? row.via : null;
    if (!declaredOn || !declaredAt || !declaredById || !via) { dropped += 1; continue; }
    seen.add(breakId);
    out.push({
      id: breakId, shiftId, personId, lineManagerId,
      start: start.text, end: end.text, startOffsetMin, endOffsetMin,
      s, e, minutes: e - s,
      declaredOn, declaredAt, declaredById, via,
      note: text(row.note, L.reasonMax),
    });
  }
  if (dropped) warnings.push(`${dropped} night-work break row(s) could not be read exactly — a break naming no shift, a break on a cancelled shift, a break outside its shift, a break shorter than the governing policy's declared minimum, or a break with an unreadable end — and were dropped. Nothing was repaired.`);
  out.sort((a, b) => a.s - b.s || a.id.localeCompare(b.id));
  return out;
}

/* ----------------------------------------------------------------- policies */

export function normalizeWorkNightPolicies(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Night-work: the policy ledger was not an array; it was read as empty.');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.nightPolicies) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const policyId = row && id(row.id);
    const label = row && workNightLabel(row.label);
    const scope = row && WORK_NIGHT_POLICY_SCOPES.includes(row.scope) ? row.scope : null;
    const source = row && workNightReason(row.source);
    const read = row ? readWorkNightThresholds(row) : { ok: false };
    const declaredOn = row && text(row.declaredOn, 10);
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
      id: policyId, label, scope, personIds, source, ...read.thresholds,
      declaredOn, declaredAt, declaredById,
      retiredAt, retiredById, retireReason: retiredAt ? text(row.retireReason, L.reasonMax) : '',
    });
  }
  if (dropped) warnings.push(`${dropped} night-work policy row(s) could not be read exactly — no written source, a window that is not a range, a limit outside its bounds, or no limit at all — and were dropped. No night window and no limit was assumed in their place.`);
  out.sort((a, b) => a.declaredAt.localeCompare(b.declaredAt) || a.id.localeCompare(b.id));
  return out;
}

/** The rule's bounded idempotency ledger. Identity-free, keyed by signature. */
export function normalizeWorkNightMarkers(value, warnings = []) {
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
  if (dropped) warnings.push(`${dropped} night-work marker row(s) were unreadable or duplicated and were dropped.`);
  return out.slice(-L.markers);
}

/* --------------------------------------------------------------- signatures */

/**
 * One condition, named deterministically: the person, the kind, the decisive
 * minute and the rows that make it. Moving a shift or completing a break
 * record changes the signature, so the old ask closes and a new one is filed
 * for the new condition — if any.
 */
export function workNightSignature({ personId, kind, at, ids }) {
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
  return `wnr1:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function workNightAskSummary(signature) {
  return `${WORK_NIGHT_ASK_PREFIX}${String(signature || '').trim()}`;
}

export function parseWorkNightAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const trimmed = summary.trim();
  if (!trimmed.startsWith(WORK_NIGHT_ASK_PREFIX)) return null;
  const signature = trimmed.slice(WORK_NIGHT_ASK_PREFIX.length).trim();
  return SIGNATURE_RE.test(signature) ? { signature } : null;
}
