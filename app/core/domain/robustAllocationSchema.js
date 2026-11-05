/**
 * app/core/domain/robustAllocationSchema.js — persistence contract for the
 * Robust Allocation Terminal (Schema v98, ADR-0095).
 *
 * A plan freezes its declared ranges, constraints and (at adoption) the exact
 * solved unit vector. Everything that travels upward (brief, CSV, graph node)
 * is built from these rows without ever copying a title, a plan id, a person
 * name or a currency amount into it. A malformed row is DROPPED with a warning,
 * never repaired into something a leader might act on.
 */
import { ALTITUDE_KEYS } from './chainRegistry.js';
import {
  ROBUST_ALLOCATION_DEFAULTS,
  ROBUST_ALLOCATION_ENGINE_VERSION,
  ROBUST_ALLOCATION_LIMITS,
  ROBUST_ALLOCATION_MARKER_KINDS,
} from './robustAllocationRegistry.js';

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALTITUDES = new Set(ALTITUDE_KEYS);
const MARKER_KINDS = new Set(ROBUST_ALLOCATION_MARKER_KINDS);
const STATUSES = new Set(['draft', 'adopted']);

function text(value, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function idOrNull(value, max = 80) {
  const result = text(value, max);
  return result || null;
}
function validDay(value) {
  const day = text(value, 10);
  if (!ISO_DAY_RE.test(day)) return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ? null : day;
}
function isoOrNull(value) {
  const raw = text(value, 40);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function boundedInt(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function normalizeRobustAllocationSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const L = ROBUST_ALLOCATION_LIMITS;
  return {
    robustAllocationCellFloor: boundedInt(source.robustAllocationCellFloor, L.cellFloorMin, L.cellFloorMax, ROBUST_ALLOCATION_DEFAULTS.robustAllocationCellFloor),
    robustAllocationReviewDays: boundedInt(source.robustAllocationReviewDays, L.reviewDaysMin, L.reviewDaysMax, ROBUST_ALLOCATION_DEFAULTS.robustAllocationReviewDays),
    robustAllocationAutoPropagate: source.robustAllocationAutoPropagate !== false,
    robustAllocationMaxCombinations: boundedInt(source.robustAllocationMaxCombinations, L.combinationsMin, L.combinationsMax, ROBUST_ALLOCATION_DEFAULTS.robustAllocationMaxCombinations),
  };
}

export function robustAllocationConventions(rawSettings = {}) {
  return normalizeRobustAllocationSettings({ ...ROBUST_ALLOCATION_DEFAULTS, ...(rawSettings || {}) });
}

function normalizeSegment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const key = text(raw.key, 40);
  const label = text(raw.label, ROBUST_ALLOCATION_LIMITS.labelMax);
  if (!key || !label) return null;
  const L = ROBUST_ALLOCATION_LIMITS;
  const size = boundedInt(raw.size, 1, L.sizeMax, 0);
  if (size < 1) return null;
  const floorCoverage = boundedInt(raw.floorCoverage, 0, L.sizeMax, 0);
  if (floorCoverage > size) return null;
  return { key, label, size, floorCoverage };
}

function normalizeAction(raw, segmentKeys) {
  if (!raw || typeof raw !== 'object') return null;
  const key = text(raw.key, 40);
  const label = text(raw.label, ROBUST_ALLOCATION_LIMITS.labelMax);
  const segmentKey = text(raw.segmentKey, 40);
  if (!key || !label || !segmentKeys.has(segmentKey)) return null;
  const L = ROBUST_ALLOCATION_LIMITS;
  const unitCost = boundedInt(raw.unitCost, 0, L.budgetMax, -1);
  const unitHours = boundedInt(raw.unitHours, 0, L.hoursMax, -1);
  const unitCoverage = boundedInt(raw.unitCoverage, 1, L.sizeMax, 0);
  const effectLo = boundedInt(raw.effectLo, 0, L.effectMax, -1);
  const effectHi = boundedInt(raw.effectHi, 0, L.effectMax, -1);
  const maxUnits = boundedInt(raw.maxUnits, 1, L.unitsMax, 0);
  if (unitCost < 0 || unitHours < 0 || unitCoverage < 1 || effectLo < 0 || effectHi < 0 || maxUnits < 1) return null;
  if (effectHi < effectLo) return null;
  return { key, label, segmentKey, unitCost, unitHours, unitCoverage, effectLo, effectHi, maxUnits };
}

/** Validate a declaration input. Returns either a clean declaration or a refusal. */
export function validateRobustAllocationDeclaration(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const L = ROBUST_ALLOCATION_LIMITS;
  const title = text(source.title, L.titleMax);
  if (!title) return { ok: false, error: 'Name the allocation in one short line so the governed decision can be read back.', field: 'title' };
  const outcomeLabel = text(source.outcomeLabel, L.labelMax);
  if (!outcomeLabel) return { ok: false, error: 'Name the outcome unit the effects are measured in (e.g. "on-time completions").', field: 'outcomeLabel' };
  const currency = text(source.currency, 8).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: 'Declare one ISO currency code (e.g. EUR). Money is never pooled across currencies.', field: 'currency' };
  const budgetCap = boundedInt(source.budgetCap, 0, L.budgetMax, -1);
  const hoursCap = boundedInt(source.hoursCap, 0, L.hoursMax, -1);
  if (budgetCap < 0) return { ok: false, error: 'Declare a non-negative whole-number budget cap.', field: 'budgetCap' };
  if (hoursCap < 0) return { ok: false, error: 'Declare a non-negative whole-number leadership-hours cap.', field: 'hoursCap' };
  const horizonDays = Number(source.horizonDays);
  if (!Number.isInteger(horizonDays) || horizonDays < L.horizonDaysMin || horizonDays > L.horizonDaysMax) {
    return { ok: false, error: `The horizon must be a whole number of days between ${L.horizonDaysMin} and ${L.horizonDaysMax}.`, field: 'horizonDays' };
  }
  const rawSegments = Array.isArray(source.segments) ? source.segments : [];
  if (rawSegments.length < 1 || rawSegments.length > L.segmentsMax) {
    return { ok: false, error: `Declare between 1 and ${L.segmentsMax} heterogeneous segments.`, field: 'segments' };
  }
  const segments = [];
  const segmentKeys = new Set();
  for (const raw of rawSegments) {
    const seg = normalizeSegment(raw);
    if (!seg) return { ok: false, error: 'Each segment needs a key, a label, a size ≥ 1 and a floor coverage no larger than its size.', field: 'segments' };
    if (segmentKeys.has(seg.key)) return { ok: false, error: `Duplicate segment key "${seg.key}".`, field: 'segments' };
    segmentKeys.add(seg.key);
    segments.push(seg);
  }
  const rawActions = Array.isArray(source.actions) ? source.actions : [];
  if (rawActions.length < 1 || rawActions.length > L.actionsMax) {
    return { ok: false, error: `Declare between 1 and ${L.actionsMax} candidate interventions.`, field: 'actions' };
  }
  const actions = [];
  const actionKeys = new Set();
  for (const raw of rawActions) {
    const act = normalizeAction(raw, segmentKeys);
    if (!act) return { ok: false, error: 'Each action needs a key, a label, a declared segment, non-negative cost/hours, coverage ≥ 1, an effect range with hi ≥ lo, and maxUnits ≥ 1.', field: 'actions' };
    if (actionKeys.has(act.key)) return { ok: false, error: `Duplicate action key "${act.key}".`, field: 'actions' };
    actionKeys.add(act.key);
    actions.push(act);
  }
  const gamma = Number(source.gamma);
  if (!Number.isInteger(gamma) || gamma < 0 || gamma > actions.length) {
    return { ok: false, error: `Declare an uncertainty budget Γ as a whole number between 0 and the number of actions (${actions.length}).`, field: 'gamma' };
  }
  // Every segment with a positive floor must be reachable by at least one action.
  for (const seg of segments) {
    if (seg.floorCoverage > 0 && !actions.some((a) => a.segmentKey === seg.key)) {
      return { ok: false, error: `Segment "${seg.label}" declares an equity floor but no action serves it; the floor is infeasible.`, field: 'segments' };
    }
  }
  return {
    ok: true,
    declaration: { title, outcomeLabel, currency, budgetCap, hoursCap, horizonDays, gamma, segments, actions },
  };
}

function normalizeFrozen(raw, actionCount) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const units = Array.isArray(raw.robustUnits) ? raw.robustUnits.map((v) => boundedInt(v, 0, ROBUST_ALLOCATION_LIMITS.unitsMax, 0)) : null;
  if (!units || units.length !== actionCount) return null;
  return {
    robustUnits: units,
    robustWorstCase: boundedInt(raw.robustWorstCase, 0, Number.MAX_SAFE_INTEGER, 0),
    robustOptimistic: boundedInt(raw.robustOptimistic, 0, Number.MAX_SAFE_INTEGER, 0),
    robustMaxRegret: boundedInt(raw.robustMaxRegret, 0, Number.MAX_SAFE_INTEGER, 0),
    minimaxUnits: Array.isArray(raw.minimaxUnits) ? raw.minimaxUnits.map((v) => boundedInt(v, 0, ROBUST_ALLOCATION_LIMITS.unitsMax, 0)) : units.slice(),
    minimaxMaxRegret: boundedInt(raw.minimaxMaxRegret, 0, Number.MAX_SAFE_INTEGER, 0),
    optimisticUnits: Array.isArray(raw.optimisticUnits) ? raw.optimisticUnits.map((v) => boundedInt(v, 0, ROBUST_ALLOCATION_LIMITS.unitsMax, 0)) : units.slice(),
    optimisticWorstCase: boundedInt(raw.optimisticWorstCase, 0, Number.MAX_SAFE_INTEGER, 0),
    priceOfFairness: boundedInt(raw.priceOfFairness, 0, Number.MAX_SAFE_INTEGER, 0),
    committedHours: boundedInt(raw.committedHours, 0, Number.MAX_SAFE_INTEGER, 0),
    committedBudget: boundedInt(raw.committedBudget, 0, Number.MAX_SAFE_INTEGER, 0),
    stressSwitches: Array.isArray(raw.stressSwitches) ? raw.stressSwitches.filter((k) => typeof k === 'string').slice(0, ROBUST_ALLOCATION_LIMITS.actionsMax) : [],
    topExposureAction: idOrNull(raw.topExposureAction, 40),
    regretRelease: boundedInt(raw.regretRelease, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

/** A plan. Draft plans re-solve live on read; adopted plans carry a frozen vector. */
export function normalizeRobustPlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = idOrNull(raw.id);
  const declaredOn = validDay(raw.declaredOn);
  const horizonOn = validDay(raw.horizonOn);
  if (!id || !declaredOn || !horizonOn || horizonOn < declaredOn) return null;
  const status = STATUSES.has(raw.status) ? raw.status : 'draft';
  const rawSegments = Array.isArray(raw.segments) ? raw.segments : [];
  const segments = [];
  const segmentKeys = new Set();
  for (const item of rawSegments.slice(0, ROBUST_ALLOCATION_LIMITS.segmentsMax)) {
    const seg = normalizeSegment(item);
    if (!seg || segmentKeys.has(seg.key)) return null;
    segmentKeys.add(seg.key);
    segments.push(seg);
  }
  if (!segments.length) return null;
  const rawActions = Array.isArray(raw.actions) ? raw.actions : [];
  const actions = [];
  const actionKeys = new Set();
  for (const item of rawActions.slice(0, ROBUST_ALLOCATION_LIMITS.actionsMax)) {
    const act = normalizeAction(item, segmentKeys);
    if (!act || actionKeys.has(act.key)) return null;
    actionKeys.add(act.key);
    actions.push(act);
  }
  if (!actions.length) return null;
  const gamma = boundedInt(raw.gamma, 0, actions.length, 0);
  const frozen = status === 'adopted' ? normalizeFrozen(raw.frozen, actions.length) : null;
  if (status === 'adopted' && !frozen) return null;
  return {
    id,
    title: text(raw.title, ROBUST_ALLOCATION_LIMITS.titleMax),
    outcomeLabel: text(raw.outcomeLabel, ROBUST_ALLOCATION_LIMITS.labelMax),
    currency: /^[A-Z]{3}$/.test(text(raw.currency, 3)) ? text(raw.currency, 3) : 'EUR',
    declaredOn,
    horizonOn,
    scopeSeatId: idOrNull(raw.scopeSeatId),
    altitudeKey: ALTITUDES.has(raw.altitudeKey) ? raw.altitudeKey : null,
    rank: boundedInt(raw.rank, 1, 5, 1),
    budgetCap: boundedInt(raw.budgetCap, 0, ROBUST_ALLOCATION_LIMITS.budgetMax, 0),
    hoursCap: boundedInt(raw.hoursCap, 0, ROBUST_ALLOCATION_LIMITS.hoursMax, 0),
    gamma,
    segments,
    actions,
    linkedContractId: idOrNull(raw.linkedContractId),
    status,
    adoptedOn: validDay(raw.adoptedOn),
    frozen,
    engineVersion: text(raw.engineVersion, 40) || ROBUST_ALLOCATION_ENGINE_VERSION,
    createdAt: isoOrNull(raw.createdAt) || `${declaredOn}T00:00:00.000Z`,
  };
}

export function normalizeRobustPlans(raw, warnings = []) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('robustPlans was not a list; reset to [].');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeRobustPlan(item);
    if (!row) {
      warnings.push('robustPlans: dropped a malformed allocation plan.');
      continue;
    }
    if (seen.has(row.id)) {
      warnings.push('robustPlans: dropped a duplicate plan id.');
      continue;
    }
    seen.add(row.id);
    out.push(row);
    if (out.length >= ROBUST_ALLOCATION_LIMITS.plans) break;
  }
  out.sort((a, b) => String(b.declaredOn).localeCompare(String(a.declaredOn)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  return out;
}

export function normalizeRobustMarker(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = idOrNull(raw.id);
  const kind = text(raw.kind, 30);
  if (!id || !MARKER_KINDS.has(kind)) return null;
  return {
    id,
    kind,
    planId: idOrNull(raw.planId),
    decisionId: idOrNull(raw.decisionId),
    weekKey: idOrNull(raw.weekKey, 12),
    recordedOn: validDay(raw.recordedOn),
    note: text(raw.note, ROBUST_ALLOCATION_LIMITS.noteMax),
  };
}

export function normalizeRobustMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeRobustMarker(item);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
    if (out.length >= ROBUST_ALLOCATION_LIMITS.markers) break;
  }
  return out;
}
