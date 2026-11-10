/**
 * app/core/domain/goalCarriageSchema.js — normalization and structural
 * validation for the Matrix Goal Carriage & Attainment Reconciliation
 * Register.
 *
 * STATUS — IN PROGRESS, NOT WIRED. These normalizers are tested but
 * `schema.js` does not call them: neither collection below is registered and
 * no workspace stores a stance. Schema v132 belongs to 1:1 holder attribution;
 * the goal-carriage migration must use a later available version.
 *
 * Collections these normalizers are written for (future schema version):
 *   - `goalLineStances`: append-only, dated, first-person statements by the
 *     manager who holds ONE of a goal owner's reporting lines — `carries`,
 *     `releases` or `withdrawn` (a previous statement taken back). One line per
 *     record. A malformed, undated, basis-less or structurally impossible row is
 *     DROPPED with a printed warning and never repaired: an invented stance is
 *     an attribution nobody made.
 *   - `goalCarriageMarkers`: bounded idempotency ledger for the planned
 *     RULE-GCA-01.
 *
 * Design intent, not yet built: nothing derived is to be stored. Which lines
 * carry a goal, which spans it counts in, every additive and distinct total
 * and every verdict are to be computed on read from these acts plus the live
 * matrix, so a printed figure cannot drift from the record that produced it.
 * No setting is planned: the rule is to honour the existing
 * `matrixAutoPropagate` switch, and the ask window is a declared constant.
 */

import {
  GOAL_CARRIAGE_LIMITS,
  GOAL_CARRIAGE_STANCES,
} from './goalCarriageRegistry.js';

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));

export function goalCarriageDayOrNull(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === s ? s : null;
}

function isoOrNull(value) {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The stable id the matrix gives a person's home line. */
export function homeLineId(personId) {
  return `home:${personId}`;
}

/**
 * One stance row, or null with nothing repaired.
 *
 * Structural refusals (each one is a row that cannot mean what it says):
 *  - a person cannot hold their own line (`goalOwnerId === lineManagerId`);
 *  - a `home:` line id must be the home line OF the named owner, so a stance
 *    cannot be filed against somebody else's home line under this owner's goal;
 *  - every stance, including a withdrawal, carries a written basis.
 */
export function normalizeGoalLineStance(item) {
  if (!isPlainObject(item)) return null;
  const id = str(item.id).trim().slice(0, 80);
  const goalId = str(item.goalId).trim().slice(0, 80);
  const lineId = str(item.lineId).trim().slice(0, 120);
  const goalOwnerId = str(item.goalOwnerId).trim().slice(0, 80);
  const lineManagerId = str(item.lineManagerId).trim().slice(0, 80);
  if (!id || !goalId || !lineId || !goalOwnerId || !lineManagerId) return null;
  if (goalOwnerId === lineManagerId) return null;
  if (lineId.startsWith('home:') && lineId !== homeLineId(goalOwnerId)) return null;

  const stance = GOAL_CARRIAGE_STANCES.includes(item.stance) ? item.stance : '';
  const decidedOn = goalCarriageDayOrNull(item.decidedOn);
  if (!stance || !decidedOn) return null;

  const basis = str(item.basis).trim().slice(0, GOAL_CARRIAGE_LIMITS.basisMax);
  if (basis.length < GOAL_CARRIAGE_LIMITS.basisMin) return null;

  return {
    id,
    goalId,
    lineId,
    goalOwnerId,
    lineManagerId,
    stance,
    basis,
    decidedOn,
    decidedBySeatId: str(item.decidedBySeatId).trim().slice(0, 80) || null,
    at: isoOrNull(item.at) || `${decidedOn}T00:00:00.000Z`,
  };
}

export function normalizeGoalLineStances(raw, warnings = []) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const item of arr) {
    const row = normalizeGoalLineStance(item);
    if (!row || seenIds.has(row.id)) { dropped += 1; continue; }
    seenIds.add(row.id);
    out.push(row);
  }
  if (dropped) {
    warnings.push(`Goal line stances: dropped ${dropped} malformed, undated, basis-less or structurally impossible record(s)`);
  }
  return out.slice(-GOAL_CARRIAGE_LIMITS.acts);
}

export function normalizeGoalCarriageMarkers(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const m of arr) {
    if (!isPlainObject(m)) continue;
    const key = str(m.key).trim().slice(0, 200);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      kind: str(m.kind).trim().slice(0, 40) || 'ask',
      lineManagerId: str(m.lineManagerId).trim().slice(0, 80) || '',
      taskId: str(m.taskId).trim().slice(0, 80) || '',
      // An unreadable count stays unknown; zero would claim the ask covered nothing.
      goalN: Number.isInteger(m.goalN) && m.goalN >= 0 ? m.goalN : null,
      recordedOn: goalCarriageDayOrNull(m.recordedOn) || null,
      summary: str(m.summary).trim().slice(0, 300),
    });
  }
  return out.slice(-GOAL_CARRIAGE_LIMITS.markers);
}

/** Append one validated act, evicting the oldest past the declared bound. */
export function appendGoalLineStance(list, row) {
  const out = Array.isArray(list) ? list : [];
  if (out.length >= GOAL_CARRIAGE_LIMITS.acts) {
    out.splice(0, out.length - GOAL_CARRIAGE_LIMITS.acts + 1);
  }
  out.push(row);
  return out;
}
