/**
 * app/core/domain/goalCommitmentSchema.js — fail-closed storage contract and
 * condition signatures for the Cross-Line Goal Commitment Conflict register
 * (ADR-0193, Schema v153).
 *
 * One append-only ledger of declarations plus the rule's bounded marker ledger.
 * NOTHING derived is stored: no overlap, no verdict, no peak day, no capacity
 * sum, no attribution state. A row that cannot be read exactly is dropped with a
 * counted warning rather than clamped into plausibility, because a repaired
 * window would then be printed as a promise a line holder never made.
 *
 * THE DOOR IS THE PRODUCT. A commitment must name a real calendar window, an
 * exact effort in integer hundredths, and — if it names a measure at all — a
 * direction from the closed set. Effort is REQUIRED, not optional: a commitment
 * that does not say what it consumes cannot be added to any other commitment,
 * and a register that accepts one would print a capacity figure it cannot
 * support. That is the same refusal ADR-0186 makes about capacity, turned round
 * onto the demand side.
 */

import {
  GOAL_COMMITMENT_DIRECTION_KEYS,
  GOAL_COMMITMENT_HOME_LINE,
  GOAL_COMMITMENT_LIMITS,
  GOAL_COMMITMENT_NO_LINE,
  GOAL_COMMITMENT_PERSON_BASIS_H,
  GOAL_COMMITMENT_ASK_PREFIX,
  GOAL_COMMITMENT_BOUNDS,
  GOAL_COMMITMENT_DEFAULTS,
  GOAL_COMMITMENT_SETTING_KEYS,
} from './goalCommitmentRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
/** A declared measure key is a short identifier, not a sentence. */
const MEASURE_RE = /^[a-z0-9][a-z0-9 ._:-]{0,39}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const id = (value) => { const c = text(value, 120); return ID_RE.test(c) ? c : null; };

/** A real calendar day as `YYYY-MM-DD`, or null. `2026-02-30` is null, not March. */
export function goalCommitmentDay(value) {
  const candidate = text(value, 10);
  if (!DAY_RE.test(candidate)) return null;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
}

/** Inclusive whole days between two day keys, or null. `2026-03-01..2026-03-01` is 1. */
export function goalCommitmentInclusiveDays(from, to) {
  if (!goalCommitmentDay(from) || !goalCommitmentDay(to) || to < from) return null;
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000) + 1;
}

/** Inclusive overlap of two windows in whole days; 0 when they do not intersect. */
export function goalCommitmentOverlapDays(aFrom, aTo, bFrom, bTo) {
  const from = aFrom > bFrom ? aFrom : bFrom;
  const to = aTo < bTo ? aTo : bTo;
  if (to < from) return 0;
  return goalCommitmentInclusiveDays(from, to) ?? 0;
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

/** Canonical measure key: trimmed, case-folded, inner whitespace collapsed. */
export function goalCommitmentMeasureKey(value) {
  const candidate = text(value, GOAL_COMMITMENT_LIMITS.measureKeyMax + 8)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (candidate.length < GOAL_COMMITMENT_LIMITS.measureKeyMin) return null;
  return MEASURE_RE.test(candidate) ? candidate.slice(0, GOAL_COMMITMENT_LIMITS.measureKeyMax) : null;
}

/* ----------------------------------------------------------------- settings */

/** The loader clamps into the declared bounds; the setter (in the actions) refuses. */
export function normalizeGoalCommitmentSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = GOAL_COMMITMENT_SETTING_KEYS;
  const B = GOAL_COMMITMENT_BOUNDS;
  const D = GOAL_COMMITMENT_DEFAULTS;
  return {
    [K.askDueDays]: boundedInt(src[K.askDueDays], B.askDueDays, D.askDueDays),
    [K.horizonDays]: boundedInt(src[K.horizonDays], B.horizonDays, D.horizonDays),
    [K.minOverlapDays]: boundedInt(src[K.minOverlapDays], B.minOverlapDays, D.minOverlapDays),
    [K.minGoals]: boundedInt(src[K.minGoals], B.minGoals, D.minGoals),
    // Only an explicit `false` pauses the rule: an unreadable value must never
    // read as "somebody switched governance off".
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

/* ------------------------------------------------------------- commitments */

/**
 * One declaration, read exactly or dropped.
 *
 * `lineKey` is `home`, `no-line`, or the id of a declared additional line — the
 * reader, not the loader, decides whether that line still exists, because a line
 * that ended AFTER a commitment was declared is a fact the register must print,
 * not a reason to erase the commitment.
 */
export function normalizeGoalCommitments(value, warnings = []) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seenId = new Set();
  const seenLiveLine = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= GOAL_COMMITMENT_LIMITS.commitments) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const commitmentId = row && id(row.id);
    const goalId = row && id(row.goalId);
    const ownerId = row && id(row.ownerId);
    const lineKey = row && (row.lineKey === GOAL_COMMITMENT_NO_LINE || row.lineKey === GOAL_COMMITMENT_HOME_LINE ? row.lineKey : id(row.lineKey));
    const holderId = row ? (row.holderId === null || row.holderId === undefined ? null : id(row.holderId)) : null;
    const windowFrom = row && goalCommitmentDay(row.windowFrom);
    const windowTo = row && goalCommitmentDay(row.windowTo);
    const declaredOn = row && goalCommitmentDay(row.declaredOn);
    const effortRaw = row ? row.effortShareH : null;
    const effortShareH = Number.isInteger(effortRaw) ? effortRaw : Math.round(Number(effortRaw));
    const measureKey = row && row.measureKey ? goalCommitmentMeasureKey(row.measureKey) : null;
    const direction = row && row.direction !== null && row.direction !== undefined && row.direction !== ''
      ? (GOAL_COMMITMENT_DIRECTION_KEYS.includes(row.direction) ? row.direction : null)
      : null;
    const supersededOn = row && row.supersededOn ? goalCommitmentDay(row.supersededOn) : null;
    const releasedOn = row && row.releasedOn ? goalCommitmentDay(row.releasedOn) : null;

    if (!commitmentId || seenId.has(commitmentId) || !goalId || !ownerId || !lineKey
      || !windowFrom || !windowTo || windowTo < windowFrom || !declaredOn
      || goalCommitmentInclusiveDays(windowFrom, windowTo) > GOAL_COMMITMENT_LIMITS.windowMaxDays
      // Effort is required and exact: a commitment that does not say what it
      // consumes cannot be summed, and a sum the register cannot support is the
      // one figure this module must never print.
      || !Number.isFinite(effortShareH) || effortShareH < 0 || effortShareH > GOAL_COMMITMENT_PERSON_BASIS_H
      // A named line carries its holder; `no-line` carries none. The reader
      // never guesses one, so the row must be internally consistent.
      || (lineKey !== GOAL_COMMITMENT_NO_LINE && !holderId)
      || (lineKey === GOAL_COMMITMENT_NO_LINE && holderId)
      // A measure with no direction, or a direction with no measure, is half a
      // declaration. Both halves are dropped rather than completed by inference.
      || (measureKey && !direction) || (!measureKey && direction)
      || (row.supersededOn && !supersededOn) || (row.releasedOn && !releasedOn)
      || (supersededOn && supersededOn < declaredOn) || (releasedOn && releasedOn < declaredOn)
      || (supersededOn && text(row.supersededReason, GOAL_COMMITMENT_LIMITS.reasonMax).length < GOAL_COMMITMENT_LIMITS.reasonMin)
      || (releasedOn && text(row.releasedReason, GOAL_COMMITMENT_LIMITS.reasonMax).length < GOAL_COMMITMENT_LIMITS.reasonMin)) {
      dropped += 1;
      continue;
    }
    seenId.add(commitmentId);
    const record = {
      id: commitmentId,
      goalId,
      ownerId,
      lineKey,
      holderId,
      windowFrom,
      windowTo,
      effortShareH,
      measureKey: measureKey || '',
      direction: direction || null,
      note: text(row.note, GOAL_COMMITMENT_LIMITS.noteMax),
      supersededById: supersededOn ? (id(row.supersededById) || null) : null,
      supersededOn,
      supersededReason: supersededOn ? text(row.supersededReason, GOAL_COMMITMENT_LIMITS.reasonMax) : '',
      releasedOn,
      releasedReason: releasedOn ? text(row.releasedReason, GOAL_COMMITMENT_LIMITS.reasonMax) : '',
      declaredById: id(row.declaredById),
      declaredOn,
      declaredAt: stamp(row.declaredAt),
    };
    // ONE live commitment per goal per line. A second live declaration for the
    // same pair is a second promise over the same window and nobody can tell
    // which one the line meant, so the later row is dropped and counted rather
    // than merged. A superseded or released row does not occupy the slot.
    if (!record.supersededOn && !record.releasedOn) {
      const slot = `${record.goalId}|${record.lineKey}`;
      if (seenLiveLine.has(slot)) { dropped += 1; continue; }
      seenLiveLine.add(slot);
    }
    out.push(record);
  }
  if (dropped) warnings.push(`${dropped} goal-commitment row(s) could not be read exactly, or were a second live promise for the same goal and line, and were dropped rather than repaired.`);
  return out;
}

/**
 * The rule's bounded idempotency ledger. Rows are identity-free markers keyed by
 * condition signature; the ledger is capped oldest-first exactly like every
 * other matrix marker ledger.
 */
export function normalizeGoalCommitmentMarkers(value, warnings = []) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    const row = isPlainObject(raw) ? raw : null;
    const key = row ? text(row.key, 200) : '';
    if (!key || seen.has(key)) { dropped += 1; continue; }
    seen.add(key);
    out.push({ key, at: stamp(row.at), ruleId: text(row.ruleId, 40), kind: text(row.kind, 40), detail: text(row.detail, 300) });
  }
  if (dropped) warnings.push(`${dropped} goal-commitment marker row(s) were unreadable or duplicated and were dropped.`);
  return out;
}

/* -------------------------------------------------------------- signatures */

/**
 * Deterministic, identity-free 64-bit FNV-1a fingerprint of one condition
 * (`gcc1:<kind>:<16-hex>`). Fixed length, so a goal id, a line id or a person id
 * never appears in a link summary, a marker key or a delegation title.
 */
export function goalCommitmentSignature(kind, key) {
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
  return `gcc1:${kind}:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function goalCommitmentAskSummary(signature) {
  return `${GOAL_COMMITMENT_ASK_PREFIX}${String(signature || '').trim()}`;
}

export function parseGoalCommitmentAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const trimmed = summary.trim();
  if (!trimmed.startsWith(GOAL_COMMITMENT_ASK_PREFIX)) return null;
  const signature = trimmed.slice(GOAL_COMMITMENT_ASK_PREFIX.length).trim();
  return /^gcc1:[a-z-]+:[0-9a-f]{16}$/.test(signature) ? { signature } : null;
}

export { text as goalCommitmentText, id as goalCommitmentId };
