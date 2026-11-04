/**
 * app/core/domain/operatingModelSchema.js — fail-closed normalizers for the
 * Operating Model (Schema v94, ADR-0088).
 *
 * A hostile, half-written or over-large blob must never produce a claim about a
 * design. Every unknown work-type, lever or decision status is dropped rather
 * than coerced; a declared norm outside its band falls back to the documented
 * convention (a typo must not silently set the working week to 70 days); an
 * undeclared hours figure stays `null` so every consumer refuses; and both
 * portfolios are capped with a printed warning instead of being truncated in
 * silence.
 */

import {
  OPERATING_MODEL_LIMITS,
  OPERATING_MODEL_NORM_DEFAULTS,
  OPERATING_MODEL_WORK_TYPES,
} from './operatingModelRegistry.js';

const object = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v) => (typeof v === 'string' ? v : '');
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const isoOrNull = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const dayOrNull = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const int = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
};
const dec = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const OM_DECISION_STATUSES = Object.freeze(['undecided', 'included', 'excluded']);
export const OM_WORK_TYPE_KEYS = Object.freeze(Object.keys(OPERATING_MODEL_WORK_TYPES));

function within(v, min, max, fallback) {
  const n = dec(v);
  return n !== null && n >= min && n <= max ? n : fallback;
}

function withinInt(v, min, max, fallback) {
  const n = int(v);
  return n !== null && n >= min && n <= max ? n : fallback;
}

/** Clamped settings. Every key is a convention the reader may change. */
export function normalizeOperatingModelSettings(settings = {}) {
  const d = OPERATING_MODEL_NORM_DEFAULTS;
  const s = object(settings) ? settings : {};
  return {
    omDeepWorkHoursPerDay: within(s.omDeepWorkHoursPerDay, 0.5, 12, d.omDeepWorkHoursPerDay),
    omWorkDaysPerWeek: withinInt(s.omWorkDaysPerWeek, 1, 7, d.omWorkDaysPerWeek),
    omCoordinationHoursPerWeek: within(s.omCoordinationHoursPerWeek, 0, 12, d.omCoordinationHoursPerWeek),
    omDelegationHoursPerWeek: within(s.omDelegationHoursPerWeek, 0, 24, d.omDelegationHoursPerWeek),
    omAbstentionHoursPerWeek: within(s.omAbstentionHoursPerWeek, 0, 24, d.omAbstentionHoursPerWeek),
    omEdgeMinutes: withinInt(s.omEdgeMinutes, 5, 240, d.omEdgeMinutes),
    omReliefWeeks: within(s.omReliefWeeks, 0.5, 12, d.omReliefWeeks),
    omAbstentionWeightPct: withinInt(s.omAbstentionWeightPct, 0, 100, d.omAbstentionWeightPct),
    omCrossWavePct: withinInt(s.omCrossWavePct, 0, 100, d.omCrossWavePct),
    omConcurrentEdges: withinInt(s.omConcurrentEdges, 1, 20, d.omConcurrentEdges),
    omMaxWave: withinInt(s.omMaxWave, 1, 200, d.omMaxWave),
    omCellFloor: withinInt(s.omCellFloor, 1, 12, d.omCellFloor),
    omUtilizationCeilPct: withinInt(s.omUtilizationCeilPct, 50, 100, d.omUtilizationCeilPct),
    omContinuityFloor: withinInt(s.omContinuityFloor, 1, 8, d.omContinuityFloor),
    omReviewDays: withinInt(s.omReviewDays, 3, 120, d.omReviewDays),
    omAutoPropagate: s.omAutoPropagate === undefined ? d.omAutoPropagate : bool(s.omAutoPropagate, d.omAutoPropagate),
  };
}

/**
 * One declared work-type split for one combination of LEVEL and FUNCTION/UNIT.
 *
 * The unit of declaration is deliberately not the person: the same seat at the
 * same level in the same function has the same design, and measuring it on a
 * person would make the module an attendance clock. Percentages are made to sum
 * to exactly 100 by placing the rounding residual on the largest field, so the
 * printed split never appears to lose four hours.
 */
export function normalizeWorkSplit(raw, warnings = []) {
  if (!object(raw)) return null;
  const id = text(raw.id).slice(0, 80);
  const level = text(raw.level).slice(0, 40);
  const functionKey = text(raw.functionKey || raw.function).slice(0, 60);
  if (!id || !functionKey) return null;
  const values = {};
  for (const key of OM_WORK_TYPE_KEYS) values[key] = Math.max(0, Math.min(100, dec(raw[key]) ?? 0));
  let total = OM_WORK_TYPE_KEYS.reduce((sum, key) => sum + values[key], 0);
  if (total <= 0) {
    warnings.push(`Operating model: work split ${id} declared no percentages and was dropped. A design with no hours is not a design.`);
    return null;
  }
  if (Math.abs(total - 100) > 0.5) {
    // Rescale rather than reject: a reader who typed 95 remembers their own
    // intent better than a normalizer does.
    for (const key of OM_WORK_TYPE_KEYS) values[key] = (values[key] / total) * 100;
    warnings.push(`Operating model: work split ${id} summed to ${Math.round(total)}% and was rescaled to 100%.`);
  }
  // Exact 100 after rounding: put the residual on the largest field.
  const rounded = {};
  let sum = 0;
  for (const key of OM_WORK_TYPE_KEYS) {
    rounded[key] = Math.round(values[key] * 10) / 10;
    sum += rounded[key];
  }
  const residual = Math.round((100 - sum) * 10) / 10;
  if (residual !== 0) {
    const largest = [...OM_WORK_TYPE_KEYS].sort((a, b) => rounded[b] - rounded[a] || a.localeCompare(b))[0];
    rounded[largest] = Math.round((rounded[largest] + residual) * 10) / 10;
  }
  return {
    id,
    level,
    functionKey,
    positionCount: Math.max(0, Math.min(500, int(raw.positionCount) ?? 0)),
    ...rounded,
    note: text(raw.note).slice(0, 240),
    declaredOn: dayOrNull(raw.declaredOn) || null,
    declaredAt: isoOrNull(raw.declaredAt),
    declaredBy: text(raw.declaredBy).slice(0, 80) || null,
    createdAt: isoOrNull(raw.createdAt),
  };
}

export function normalizeWorkSplits(raw, warnings = [], { cap = 120 } = {}) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    const normalized = normalizeWorkSplit(row, warnings);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    out.push(normalized);
  }
  const limit = Number.isFinite(Number(cap)) && Number(cap) > 0 ? Math.round(Number(cap)) : 120;
  if (out.length > limit) {
    warnings.push(`Operating model: ${out.length - limit} work split(s) beyond the cap were left out of the read model — they were not deleted from the workspace.`);
    return out.slice(0, limit);
  }
  return out;
}

/**
 * One priced portfolio item. This is the bridge between the operating model and
 * the decision machinery the workspace already has: every candidate carries a
 * *measured cycle time* so the same item can be priced as a timed obligation.
 */
export function normalizeOperatingModelDecision(raw, warnings = []) {
  if (!object(raw)) return null;
  const id = text(raw.id).slice(0, 80);
  const name = text(raw.name).slice(0, 180);
  if (!id || !name) return null;
  const status = OM_DECISION_STATUSES.includes(raw.status) ? raw.status : 'undecided';
  const weeklyHours = dec(raw.weeklyHours);
  const cycleDays = dec(raw.cycleDays);
  if (weeklyHours !== null && weeklyHours < 0) {
    warnings.push(`Operating model: portfolio item ${id} declared negative hours and was treated as undeclared.`);
  }
  return {
    id,
    name,
    kind: text(raw.kind).slice(0, 40) || 'task',
    ownerId: text(raw.ownerId).slice(0, 80) || null,
    unitId: text(raw.unitId).slice(0, 80) || null,
    weeklyHours: weeklyHours !== null && weeklyHours >= 0 ? Math.min(400, Math.round(weeklyHours * 10) / 10) : null,
    cycleDays: cycleDays !== null && cycleDays > 0 ? Math.min(3650, Math.round(cycleDays * 10) / 10) : null,
    status,
    value: dec(raw.value),
    currency: text(raw.currency).slice(0, 8) || null,
    source: text(raw.source).slice(0, 40) || 'declared',
    note: text(raw.note).slice(0, 240),
    createdAt: isoOrNull(raw.createdAt),
  };
}

export function normalizeOperatingModelDecisions(raw, warnings = [], { cap = OPERATING_MODEL_LIMITS.decisions } = {}) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    const normalized = normalizeOperatingModelDecision(row, warnings);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    out.push(normalized);
  }
  const limit = Number.isFinite(Number(cap)) && Number(cap) > 0 ? Math.min(OPERATING_MODEL_LIMITS.decisions, Math.round(Number(cap))) : OPERATING_MODEL_LIMITS.decisions;
  if (out.length > limit) {
    warnings.push(`Operating model: ${out.length - limit} portfolio item(s) beyond the cap were left out of the read model — they were not deleted from the workspace.`);
    return out.slice(0, limit);
  }
  return out;
}

/** Bounded, idempotent marker ledger (never authored by a person). */
export function normalizeOperatingModelMarkers(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const tag of raw) {
    if (typeof tag !== 'string' || !tag) continue;
    const trimmed = tag.slice(0, 180);
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  const cap = OPERATING_MODEL_LIMITS.markers;
  if (out.length > cap) {
    warnings.push(`Operating model: ${out.length - cap} idempotency marker(s) beyond the cap were dropped; an explicit scan may re-grade an old span.`);
    return out.slice(out.length - cap);
  }
  return out;
}
