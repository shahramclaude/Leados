/**
 * app/core/domain/standardWorkSchema.js — fail-closed storage contract, calendar
 * slot arithmetic and condition signatures for Leader Standard Work & Tiered
 * Daily Management (ADR-0190, Schema v150).
 *
 * Three append-only ledgers: declared routines, first-person checks, and
 * first-person tier acts on an escalated abnormality. NOTHING derived is stored
 * — no slot state, rate, streak, verdict or roll-up. A row that cannot be read
 * exactly is dropped with a warning; nothing is clamped into plausibility,
 * because a repaired row would then be printed as something a human recorded.
 */

import { addDays, weekStart } from '../time.js';
import {
  STANDARD_WORK_ASK_SUMMARY_PREFIX,
  STANDARD_WORK_BOUNDS,
  STANDARD_WORK_CADENCE_KEYS,
  STANDARD_WORK_DEFAULTS,
  STANDARD_WORK_DISPOSITION_KEYS,
  STANDARD_WORK_KIND_KEYS,
  STANDARD_WORK_LIMITS,
  STANDARD_WORK_OUTCOME_KEYS,
  STANDARD_WORK_SETTING_KEYS,
  STANDARD_WORK_TIER_ACT_KEYS,
} from './standardWorkRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const id = (value) => { const c = text(value, 120); return ID_RE.test(c) ? c : null; };

/** A real calendar day as `YYYY-MM-DD`, or null. `2026-02-30` is null, not March. */
export function standardWorkDay(value) {
  const candidate = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
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

/* ----------------------------------------------------------------- settings */

/** The loader clamps into the declared bounds; the setter (in the actions) refuses. */
export function normalizeStandardWorkSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = STANDARD_WORK_SETTING_KEYS;
  const B = STANDARD_WORK_BOUNDS;
  const D = STANDARD_WORK_DEFAULTS;
  return {
    [K.windowDays]: boundedInt(src[K.windowDays], B.windowDays, D.windowDays),
    [K.minSlots]: boundedInt(src[K.minSlots], B.minSlots, D.minSlots),
    [K.lapseRun]: boundedInt(src[K.lapseRun], B.lapseRun, D.lapseRun),
    [K.tierDays]: boundedInt(src[K.tierDays], B.tierDays, D.tierDays),
    [K.weekMinutes]: boundedInt(src[K.weekMinutes], B.weekMinutes, D.weekMinutes),
    // Only an explicit `false` pauses the rule: an unreadable value must never
    // read as "somebody switched governance off".
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

/* ------------------------------------------------------------ calendar slots */

const dow = (day) => new Date(`${day}T00:00:00.000Z`).getUTCDay();

/** ISO-8601 week key (`2026-W46`) of a day. The week's Thursday names its year. */
export function standardWorkWeekKey(day) {
  const monday = weekStart(day);
  if (!monday) return null;
  const thursday = addDays(monday, 3);
  const year = Number(thursday.slice(0, 4));
  const firstMonday = weekStart(`${year}-01-04`);
  const week = Math.round((Date.parse(`${monday}T00:00:00.000Z`) - Date.parse(`${firstMonday}T00:00:00.000Z`)) / 604800000) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The inclusive period a slot key names, or null when the key is not a real slot. */
export function standardWorkSlotRange(cadence, slotKey) {
  const key = text(slotKey, 12);
  if (cadence === 'daily') {
    const day = standardWorkDay(key);
    return day ? { start: day, end: day } : null;
  }
  if (cadence === 'weekly') {
    const match = /^(\d{4})-W(\d{2})$/.exec(key);
    if (!match) return null;
    const week = Number(match[2]);
    if (week < 1 || week > 53) return null;
    const start = addDays(weekStart(`${match[1]}-01-04`), (week - 1) * 7);
    // Week 53 exists only in some years: the round trip is the validity test.
    return standardWorkWeekKey(start) === key ? { start, end: addDays(start, 6) } : null;
  }
  if (cadence === 'monthly') {
    const match = /^(\d{4})-(\d{2})$/.exec(key);
    if (!match) return null;
    const start = standardWorkDay(`${key}-01`);
    if (!start) return null;
    const month = Number(match[2]);
    const nextStart = month === 12 ? `${Number(match[1]) + 1}-01-01` : `${match[1]}-${String(month + 1).padStart(2, '0')}-01`;
    return { start, end: addDays(nextStart, -1) };
  }
  return null;
}

/** The slot key of the period containing `day` for a cadence. */
export function standardWorkSlotKeyFor(cadence, day) {
  const d = standardWorkDay(day);
  if (!d) return null;
  if (cadence === 'daily') return d;
  if (cadence === 'weekly') return standardWorkWeekKey(d);
  if (cadence === 'monthly') return d.slice(0, 7);
  return null;
}

/** The slot immediately before `slotKey` on the routine's own calendar, or null. */
export function standardWorkPreviousSlot(routine, slotKey) {
  const range = standardWorkSlotRange(routine.cadence, slotKey);
  if (!range) return null;
  if (routine.cadence !== 'daily') return standardWorkSlotKeyFor(routine.cadence, addDays(range.start, -1));
  const days = new Set(routine.weekdays || []);
  for (let back = 1; back <= 7; back += 1) {
    const day = addDays(range.start, -back);
    if (days.has(dow(day))) return day;
  }
  return null;
}

/**
 * Whether a slot key is a real slot of this routine at all: a well-formed
 * period that starts on or after the routine did and (daily) falls on one of
 * its declared working weekdays.
 */
export function standardWorkSlotValid(routine, slotKey) {
  const range = standardWorkSlotRange(routine.cadence, slotKey);
  if (!range) return false;
  if (routine.fromDay > range.start) return false;
  if (routine.cadence === 'daily' && !(routine.weekdays || []).includes(dow(range.start))) return false;
  return true;
}

/**
 * Whether the routine OWES this slot: it is a real slot AND the routine was in
 * force for the whole period. A part-period is not owed — a routine declared on
 * a Wednesday owes nothing for that week, and one retired mid-month owes
 * nothing for that month.
 */
export function standardWorkOwesSlot(routine, slotKey) {
  if (!standardWorkSlotValid(routine, slotKey)) return false;
  const range = standardWorkSlotRange(routine.cadence, slotKey);
  return !(routine.retiredOn && routine.retiredOn <= range.end);
}

/* ----------------------------------------------------------------- routines */

function normalizeWeekdays(value) {
  if (!Array.isArray(value)) return null;
  const out = [...new Set(value.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
  return out.length ? out : null;
}

export function normalizeStandardWorkRoutines(value, warnings = []) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= STANDARD_WORK_LIMITS.routines) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const routineId = row && id(row.id);
    const ownerId = row && id(row.ownerId);
    const title = row ? text(row.title, STANDARD_WORK_LIMITS.titleMax) : '';
    const standard = row ? text(row.standard, STANDARD_WORK_LIMITS.standardMax) : '';
    const fromDay = row && standardWorkDay(row.fromDay);
    const minutes = row ? Number(row.minutes) : NaN;
    const [minM, maxM] = STANDARD_WORK_LIMITS.minutes;
    const cadence = row && STANDARD_WORK_CADENCE_KEYS.includes(row.cadence) ? row.cadence : null;
    const kind = row && STANDARD_WORK_KIND_KEYS.includes(row.kind) ? row.kind : null;
    const weekdays = cadence === 'daily' ? normalizeWeekdays(row.weekdays) : [];
    const retiredOn = row && row.retiredOn ? standardWorkDay(row.retiredOn) : null;
    if (!routineId || seen.has(routineId) || !ownerId || title.length < STANDARD_WORK_LIMITS.titleMin
      || standard.length < STANDARD_WORK_LIMITS.standardMin || !fromDay || !cadence || !kind
      || !Number.isInteger(minutes) || minutes < minM || minutes > maxM || !weekdays
      || (row.retiredOn && !retiredOn) || (retiredOn && retiredOn < fromDay)) {
      dropped += 1;
      continue;
    }
    seen.add(routineId);
    out.push({
      id: routineId,
      ownerId,
      title,
      standard,
      kind,
      cadence,
      minutes,
      weekdays,
      lineKey: row.lineKey === 'home' ? 'home' : id(row.lineKey),
      fromDay,
      retiredOn,
      retiredReason: retiredOn ? text(row.retiredReason, STANDARD_WORK_LIMITS.noteMax) : '',
      declaredOn: standardWorkDay(row.declaredOn) || fromDay,
      declaredAt: stamp(row.declaredAt),
      declaredById: id(row.declaredById),
    });
  }
  if (dropped) warnings.push(`${dropped} standard-work routine row(s) could not be read exactly and were dropped rather than repaired.`);
  return out;
}

/* ------------------------------------------------------------------- checks */

/** A check names the slot its recording day falls in, or the routine's slot immediately before that one. */
function recordedInTime(routine, slotKey, recordedOn) {
  const current = standardWorkSlotKeyFor(routine.cadence, recordedOn);
  return slotKey === current || slotKey === standardWorkPreviousSlot(routine, current);
}

export function normalizeStandardWorkChecks(value, routines = [], warnings = []) {
  if (!Array.isArray(value)) return [];
  const byRoutine = new Map(routines.map((routine) => [routine.id, routine]));
  const out = [];
  const seenId = new Set();
  const seenSlot = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= STANDARD_WORK_LIMITS.checks) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const checkId = row && id(row.id);
    const routine = row ? byRoutine.get(id(row.routineId)) : null;
    const outcome = row && STANDARD_WORK_OUTCOME_KEYS.includes(row.outcome) ? row.outcome : null;
    const recordedOn = row && standardWorkDay(row.recordedOn);
    const range = routine ? standardWorkSlotRange(routine.cadence, row.slotKey) : null;
    const note = row ? text(row.note, STANDARD_WORK_LIMITS.noteMax) : '';
    const disposition = outcome === 'abnormal' && STANDARD_WORK_DISPOSITION_KEYS.includes(row.disposition) ? row.disposition : null;
    const toId = disposition === 'escalated' ? id(row.toId) : null;
    const slotKey = range ? text(row.slotKey, 12) : null;
    const dupKey = routine && slotKey ? `${routine.id}|${slotKey}` : null;
    // A check must name a real slot of its routine, be dated on or after the slot
    // opened and before the routine was retired, carry the words its outcome
    // requires, and be the ONLY check for its slot. A check recorded before a
    // mid-period retirement is KEPT: retiring a routine never deletes history.
    if (!checkId || seenId.has(checkId) || !routine || !outcome || !recordedOn || !range
      || seenSlot.has(dupKey) || !standardWorkSlotValid(routine, slotKey) || recordedOn < range.start
      || (routine.retiredOn && recordedOn > routine.retiredOn)
      // First-person, and never back-filled: the check is the owner's own, and it
      // names the slot of the day it was recorded or the one immediately before.
      || id(row.recordedById) !== routine.ownerId || !recordedInTime(routine, slotKey, recordedOn)
      || (outcome !== 'done' && note.length < STANDARD_WORK_LIMITS.noteMin)
      || (outcome === 'abnormal' && !disposition) || (disposition === 'escalated' && !toId)) {
      dropped += 1;
      continue;
    }
    seenId.add(checkId);
    seenSlot.add(dupKey);
    out.push({
      id: checkId,
      routineId: routine.id,
      slotKey,
      outcome,
      recordedOn,
      recordedAt: stamp(row.recordedAt),
      recordedById: id(row.recordedById),
      late: recordedOn > range.end,
      note,
      disposition,
      toId,
    });
  }
  if (dropped) warnings.push(`${dropped} standard-work check row(s) could not be read exactly and were dropped rather than repaired.`);
  return out;
}

/* ---------------------------------------------------------------- tier acts */

/**
 * Tier acts replay as a chain per escalated check: hop 1 is acted on by the
 * leader the check named, and each `escalated` act names the leader of the next
 * hop. An act out of sequence, by anyone but the addressed leader, or after the
 * chain closed is dropped — a chain with a hole in it is not a chain.
 */
export function normalizeStandardWorkTierActs(value, checks = [], warnings = []) {
  if (!Array.isArray(value)) return [];
  const escalated = new Map(checks.filter((check) => check.disposition === 'escalated').map((check) => [check.id, check]));
  const rows = [];
  let dropped = 0;
  const seen = new Set();
  for (const raw of value) {
    const row = isPlainObject(raw) ? raw : null;
    const actId = row && id(row.id);
    const check = row ? escalated.get(id(row.checkId)) : null;
    const act = row && STANDARD_WORK_TIER_ACT_KEYS.includes(row.act) ? row.act : null;
    const hop = row ? Number(row.hop) : NaN;
    const actorId = row && id(row.actorId);
    const actedOn = row && standardWorkDay(row.actedOn);
    const note = row ? text(row.note, STANDARD_WORK_LIMITS.noteMax) : '';
    const toId = act === 'escalated' ? id(row.toId) : null;
    if (!actId || seen.has(actId) || !check || !act || !Number.isInteger(hop) || hop < 1 || hop > STANDARD_WORK_LIMITS.hops
      || !actorId || !actedOn || actedOn < check.recordedOn || note.length < STANDARD_WORK_LIMITS.noteMin
      || (act === 'escalated' && (!toId || toId === actorId))) {
      dropped += 1;
      continue;
    }
    seen.add(actId);
    rows.push({ id: actId, checkId: check.id, hop, actorId, act, toId, actedOn, actedAt: stamp(row.actedAt), note });
  }
  rows.sort((a, b) => a.checkId.localeCompare(b.checkId) || a.hop - b.hop || a.id.localeCompare(b.id));
  const out = [];
  const cursor = new Map();
  for (const row of rows) {
    if (out.length >= STANDARD_WORK_LIMITS.tierActs) { dropped += 1; continue; }
    const check = escalated.get(row.checkId);
    const state = cursor.get(row.checkId) || { hop: 1, holderId: check.toId, closed: false, lastOn: check.recordedOn };
    if (state.closed || row.hop !== state.hop || row.actorId !== state.holderId || row.actedOn < state.lastOn) { dropped += 1; continue; }
    out.push(row);
    cursor.set(row.checkId, row.act === 'escalated'
      ? { hop: state.hop + 1, holderId: row.toId, closed: false, lastOn: row.actedOn }
      : { hop: state.hop, holderId: null, closed: true, lastOn: row.actedOn });
  }
  if (dropped) warnings.push(`${dropped} standard-work tier-act row(s) were out of sequence or unreadable and were dropped rather than repaired.`);
  return out;
}

/* -------------------------------------------------------------- signatures */

/**
 * Deterministic, identity-free 64-bit FNV-1a fingerprint of one condition
 * (`lsw1:<kind>:<16-hex>`). Fixed length, so a routine or check id never
 * appears in a link summary or a marker key.
 */
export function standardWorkSignature(kind, key) {
  const joined = `${String(kind || '').trim()}\n${String(key || '').trim()}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < joined.length; i += 1) {
    const code = joined.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (code ^ (i & 0xff));
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return `lsw1:${kind}:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function standardWorkAskSummary(signature) {
  return `${STANDARD_WORK_ASK_SUMMARY_PREFIX}${String(signature || '').trim()}`;
}

export function parseStandardWorkAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const trimmed = summary.trim();
  if (!trimmed.startsWith(STANDARD_WORK_ASK_SUMMARY_PREFIX)) return null;
  const signature = trimmed.slice(STANDARD_WORK_ASK_SUMMARY_PREFIX.length).trim();
  return /^lsw1:[a-z-]+:[0-9a-f]{16}$/.test(signature) ? { signature } : null;
}
