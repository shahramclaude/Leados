/**
 * app/core/domain/workforceFlowSchema.js — fail-closed normalisation and the
 * single validator for the Workforce Stock-Flow Plan (ADR-0184, Schema v146).
 *
 * WHAT IS STORED
 *   `workforceFlowActs`     append-only dated MOVE acts. One act says: on this
 *                           day, this kind of move happened, from this level to
 *                           that level. Both ends may be null only in the way
 *                           the kind declares (a hire has no origin stock; an
 *                           exit has no destination stock).
 *   `workforceFlowTargets`  append-only dated SHAPE declarations: "at the end
 *                           of a horizon I intend to hold N people at level L".
 *                           A retired target keeps its row.
 *   `workforceFlowMarkers`  RULE-WFS-01's bounded idempotency ledger.
 *   four settings + one switch.
 *
 * WHAT IS NEVER STORED. A rate, an exposure, a projected headcount, a wait
 * time, a gap, a verdict. Every one of those is re-derived on read from the acts
 * and the roster, so a printed figure cannot drift from the record under it.
 * Nothing is back-filled on upgrade: an existing workspace has a roster full of
 * levels it reached by some unrecorded history, and inventing that history at
 * upgrade time would fabricate the very transition counts this module is
 * careful to earn.
 *
 * A malformed act is DROPPED with a counted warning. It is never repaired into
 * a transition: a repaired move is a transition that never happened, and once
 * it is in the ledger nothing downstream can tell it from one that did.
 */

import {
  WORKFORCE_FLOW_BOUNDS,
  WORKFORCE_FLOW_DEFAULTS,
  WORKFORCE_FLOW_LEVEL_KEYS,
  WORKFORCE_FLOW_LIMITS,
  WORKFORCE_FLOW_SETTING_KEYS,
  workforceFlowKind,
  workforceLevelIndex,
} from './workforceFlowRegistry.js';

const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const LEVEL_KEYS = new Set(WORKFORCE_FLOW_LEVEL_KEYS);

function isoOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function dayOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toISOString().slice(0, 10);
  // A day that does not round-trip is not a day (2026-02-31 → 2026-03-03).
  return value.trim().slice(0, 10) === day || /^\d{4}-\d{2}-\d{2}T/.test(value.trim()) ? day : null;
}

function boundedInt(value, [min, max], fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

/** The declared conventions, resolved from settings. Loader clamps; setter refuses. */
export function normalizeWorkforceFlowSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = WORKFORCE_FLOW_SETTING_KEYS;
  return {
    [K.windowMonths]: boundedInt(src[K.windowMonths], WORKFORCE_FLOW_BOUNDS.windowMonths, WORKFORCE_FLOW_DEFAULTS.windowMonths),
    [K.horizonQuarters]: boundedInt(src[K.horizonQuarters], WORKFORCE_FLOW_BOUNDS.horizonQuarters, WORKFORCE_FLOW_DEFAULTS.horizonQuarters),
    [K.minExposure]: boundedInt(src[K.minExposure], WORKFORCE_FLOW_BOUNDS.minExposure, WORKFORCE_FLOW_DEFAULTS.minExposure),
    [K.askDueDays]: boundedInt(src[K.askDueDays], WORKFORCE_FLOW_BOUNDS.askDueDays, WORKFORCE_FLOW_DEFAULTS.askDueDays),
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

export const WORKFORCE_FLOW_DEFAULTS_RESOLVED = Object.freeze(normalizeWorkforceFlowSettings({}));

function levelOrNull(value) {
  const s = str(value);
  return LEVEL_KEYS.has(s) ? s : null;
}

/**
 * Validate one move request. ONE function, used by the loader and by the action,
 * so an act that the action accepts can never be dropped by the next reload.
 *
 * Returns `{ refusals: string[], act: {...} | null }`. The caller decides what to
 * do with several refusals — the action refuses the write and lists them all.
 */
export function validateWorkforceMove(state, input, { today = null, idFactory = null } = {}) {
  const refusals = [];
  const src = isPlainObject(input) ? input : {};
  const kind = str(src.kind);
  const declared = workforceFlowKind(kind);
  if (!declared) refusals.push('unknown-kind');

  const personId = str(src.personId);
  const people = Array.isArray(state?.people) ? state.people : [];
  const person = people.find((p) => p && p.id === personId) || null;
  if (!personId || !person) refusals.push('missing-person');

  // `outside` is accepted as the boundary stock by name, and is normalised to
  // null: a hire has no origin stock and an exit has no destination stock, and
  // storing the literal word in a level column would make it a level.
  const boundary = (v) => (v === null || v === undefined || v === '' || str(v) === 'outside' ? null : str(v));
  const fromRaw = boundary(src.fromLevel);
  const toRaw = boundary(src.toLevel);
  const fromLevel = fromRaw === null ? null : levelOrNull(fromRaw);
  const toLevel = toRaw === null ? null : levelOrNull(toRaw);
  if ((fromRaw !== null && !fromLevel) || (toRaw !== null && !toLevel)) refusals.push('unknown-level');

  const effectiveOn = dayOrNull(src.effectiveOn);
  if (!effectiveOn) refusals.push('bad-day');

  // The kind DECLARES which ends must be present, and in which direction. An act
  // whose levels contradict its own declaration is refused rather than stored
  // under a kind it does not describe.
  if (declared && !refusals.includes('unknown-level')) {
    const fromIndex = fromLevel ? workforceLevelIndex(fromLevel) : null;
    const toIndex = toLevel ? workforceLevelIndex(toLevel) : null;
    if (declared.from === 'outside' && fromLevel !== null) refusals.push('direction-mismatch');
    if (declared.to === 'outside' && toLevel !== null) refusals.push('direction-mismatch');
    if (declared.from === 'level' && fromLevel === null) refusals.push('direction-mismatch');
    if (declared.to === 'level' && toLevel === null) refusals.push('direction-mismatch');
    if (declared.from !== 'outside' && declared.to !== 'outside' && fromLevel !== null && toLevel !== null) {
      if (declared.direction === 'up' && !(toIndex > fromIndex)) refusals.push('direction-mismatch');
      if (declared.direction === 'down' && !(toIndex < fromIndex)) refusals.push('direction-mismatch');
      if (declared.direction === 'flat' && toIndex !== fromIndex) refusals.push('direction-mismatch');
      if (declared.direction === 'up' && toIndex === fromIndex) refusals.push('same-level-promotion');
      if (declared.direction === 'down' && toIndex === fromIndex) refusals.push('same-level-promotion');
    }
  }

  if (effectiveOn && today && effectiveOn > today) refusals.push('future-day');
  if (effectiveOn && person?.startDate && effectiveOn < person.startDate) refusals.push('before-start');

  // A person moves once per day in this ledger. A second act for the same person
  // on the same day is refused: two moves on one day describe no order the stock
  // can be stepped through, and a reader would have to pick one.
  const acts = Array.isArray(state?.workforceFlowActs) ? state.workforceFlowActs : [];
  if (effectiveOn && personId && acts.some((a) => a && a.personId === personId && a.effectiveOn === effectiveOn)) {
    refusals.push('duplicate');
  }
  if (acts.length >= WORKFORCE_FLOW_LIMITS.acts) refusals.push('ledger-full');

  if (refusals.length) return { refusals: [...new Set(refusals)], act: null };

  return {
    refusals: [],
    act: {
      id: idFactory ? idFactory('wfm') : `wfm-${Math.random().toString(36).slice(2, 10)}`,
      kind,
      personId,
      fromLevel,
      toLevel,
      effectiveOn,
      note: str(src.note).slice(0, 300),
    },
  };
}

/**
 * Load stored acts. Every refusal is counted, none is repaired.
 *
 * `seen` indexes (personId, effectiveOn) so an imported file cannot smuggle two
 * moves for one person on one day past the validator that would refuse them.
 */
export function normalizeWorkforceFlowActs(raw, state, today, warnings = []) {
  // A withdrawn act is KEPT — marked, not deleted. A transition that vanished
  // from the ledger would silently move every rate in the panel, and the record
  // of who withdrew it and why is the only thing that makes the correction
  // auditable. The reader excludes withdrawn rows from every count.
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seenIds = new Set();
  const seenDay = new Set();
  let malformed = 0;
  for (const item of arr) {
    if (!isPlainObject(item)) { malformed += 1; continue; }
    const id = str(item.id).slice(0, 80);
    if (!id || seenIds.has(id)) { malformed += 1; continue; }
    const { refusals, act } = validateWorkforceMove(state, {
      kind: item.kind,
      personId: item.personId,
      fromLevel: item.fromLevel,
      toLevel: item.toLevel,
      effectiveOn: item.effectiveOn,
    }, { today });
    if (refusals.length) { malformed += 1; continue; }
    const dayKey = `${act.personId}|${act.effectiveOn}`;
    if (seenDay.has(dayKey)) { malformed += 1; continue; }
    seenDay.add(dayKey);
    seenIds.add(id);
    const withdrawn = item.withdrawn === true && Boolean(dayOrNull(item.withdrawnOn));
    out.push({
      ...act,
      id,
      note: str(item.note).slice(0, 300),
      recordedOn: dayOrNull(item.recordedOn) || dayOrNull(item.at) || act.effectiveOn,
      recordedById: str(item.recordedById).slice(0, 80) || null,
      at: isoOrNull(item.at) || `${act.effectiveOn}T00:00:00.000Z`,
      withdrawn,
      withdrawnOn: withdrawn ? dayOrNull(item.withdrawnOn) : null,
      withdrawnById: withdrawn ? (str(item.withdrawnById).slice(0, 80) || null) : null,
      withdrawnReason: withdrawn ? (str(item.withdrawnReason).slice(0, 300) || null) : null,
      withdrawnAt: withdrawn ? isoOrNull(item.withdrawnAt) : null,
    });
  }
  if (malformed) {
    warnings.push(`Workforce moves: dropped ${malformed} unreadable move act(s); none was repaired into a transition that never happened`);
  }
  out.sort((a, b) => String(a.effectiveOn).localeCompare(String(b.effectiveOn)) || String(a.id).localeCompare(String(b.id)));
  return out.length > WORKFORCE_FLOW_LIMITS.acts ? out.slice(out.length - WORKFORCE_FLOW_LIMITS.acts) : out;
}

/**
 * Load stored target-shape declarations. A target is a whole headcount at a
 * level by a horizon day. Zero is a legitimate target (we intend to hold nobody
 * at that level); a MISSING target is not the same thing and is never filled
 * with zero by this loader.
 */
export function normalizeWorkforceFlowTargets(raw, today, warnings = []) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  let malformed = 0;
  let future = 0;
  for (const item of arr) {
    if (!isPlainObject(item)) { malformed += 1; continue; }
    const id = str(item.id).slice(0, 80);
    const level = levelOrNull(item.level);
    const headcount = item.headcount;
    const byOn = dayOrNull(item.byOn);
    if (!id || seen.has(id) || !level || !Number.isInteger(headcount) || headcount < 0 || headcount > 100000 || !byOn) {
      malformed += 1;
      continue;
    }
    if (today && byOn <= today) {
      // A target for a day that has already passed is not a plan; it is either a
      // note about the past or a typo, and neither is an intended shape.
      future += 1;
      continue;
    }
    seen.add(id);
    out.push({
      id,
      level,
      headcount,
      byOn,
      note: str(item.note).slice(0, 300),
      declaredOn: dayOrNull(item.declaredOn) || byOn,
      declaredById: str(item.declaredById).slice(0, 80) || null,
      retired: item.retired === true && Boolean(dayOrNull(item.retiredOn)),
      retiredOn: item.retired === true ? dayOrNull(item.retiredOn) : null,
      retiredById: str(item.retiredById).slice(0, 80) || null,
      at: isoOrNull(item.at) || `${byOn}T00:00:00.000Z`,
    });
  }
  if (malformed) warnings.push(`Workforce targets: dropped ${malformed} malformed shape declaration(s); an intended headcount is a whole number at a declared level by a declared day`);
  if (future) warnings.push(`Workforce targets: dropped ${future} declaration(s) whose horizon day has already passed; an intended shape is a plan, not a note about the past`);
  out.sort((a, b) => String(a.byOn).localeCompare(String(b.byOn)) || String(a.id).localeCompare(String(b.id)));
  return out.length > WORKFORCE_FLOW_LIMITS.targets ? out.slice(out.length - WORKFORCE_FLOW_LIMITS.targets) : out;
}

export function normalizeWorkforceFlowMarkers(raw) {
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
      at: isoOrNull(item.at),
    });
  }
  const cap = WORKFORCE_FLOW_LIMITS.markers;
  return out.length > cap ? out.slice(out.length - cap) : out;
}

/**
 * The live target per level on `day`: the LATEST declaration whose horizon has
 * not yet passed, preferring the most recently declared. Returns a Map so the
 * reader and the rule cannot disagree about which shape is in force.
 */
export function liveWorkforceTargets(targets, today) {
  const map = new Map();
  const rows = (Array.isArray(targets) ? targets : [])
    .filter((t) => t && !t.retired && (!today || t.byOn > today))
    .sort((a, b) => String(b.declaredOn).localeCompare(String(a.declaredOn)) || String(b.at).localeCompare(String(a.at)));
  for (const row of rows) if (!map.has(row.level)) map.set(row.level, row);
  return map;
}
