/**
 * Persistence contract for the Strategy Renewal Bridge (Schema v91). Frozen
 * readings contain bounded counts, rates and typed IDs only: no pact title,
 * free text, person name, budget amount or private decision text is copied.
 */
import { ALTITUDE_KEYS } from './chainRegistry.js';
import {
  STRATEGY_CYCLE_DEFAULTS,
  STRATEGY_CYCLE_LIMITS,
} from './strategyCycleRegistry.js';

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const READING_STATUSES = Object.freeze(['frozen', 'graded', 'lapsed']);
const FORECAST_REFUSALS = Object.freeze(['below-evidence-floor', 'no-settled-history', 'small-cell-suppressed', 'none']);
const MARKER_KINDS = Object.freeze(['cycle-linked', 'reinvestment-decision', 'retired-bet-overflow', 'graded']);

function text(value, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function idOrNull(value) {
  const result = text(value, 80);
  return result || null;
}

function validDay(value) {
  const day = text(value, 10);
  if (!ISO_DAY_RE.test(day)) return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ? null : day;
}

function boundedInt(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function boundedNumber(value, min = 0, max = 1e9, fallback = 0, dp = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const factor = 10 ** dp;
  return Math.round(Math.min(max, Math.max(min, number)) * factor) / factor;
}

function pctOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? boundedNumber(number, 0, 100, 0, 1) : null;
}

function normalizeMetrics(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    active: boundedInt(s.active, 0, STRATEGY_CYCLE_LIMITS.cohortPacts),
    carryover: boundedInt(s.carryover, 0, STRATEGY_CYCLE_LIMITS.cohortPacts),
    overdue: boundedInt(s.overdue, 0, STRATEGY_CYCLE_LIMITS.cohortPacts),
    watermelon: boundedInt(s.watermelon, 0, STRATEGY_CYCLE_LIMITS.cohortPacts),
    stopRuleDue: boundedInt(s.stopRuleDue, 0, STRATEGY_CYCLE_LIMITS.cohortPacts),
    stoppedBet: boundedInt(s.stoppedBet, 0, STRATEGY_CYCLE_LIMITS.cohortPacts),
    unmeasured: boundedInt(s.unmeasured, 0, STRATEGY_CYCLE_LIMITS.cohortPacts),
    effortDays: boundedNumber(s.effortDays),
    releasedEffortDays: boundedNumber(s.releasedEffortDays),
    reviewEffortDays: boundedNumber(s.reviewEffortDays),
    suppressed: s.suppressed === true,
  };
}

function normalizeForecast(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const refusal = FORECAST_REFUSALS.includes(s.refusal) ? s.refusal : 'no-settled-history';
  return {
    basis: s.basis === 'all-altitudes' ? 'all-altitudes' : 'same-altitude',
    settledN: boundedInt(s.settledN, 0, 100000),
    deliveredN: boundedInt(s.deliveredN, 0, 100000),
    deliveryRatePct: pctOrNull(s.deliveryRatePct),
    lowerPct: pctOrNull(s.lowerPct),
    upperPct: pctOrNull(s.upperPct),
    brier: s.brier === null || s.brier === undefined ? null : boundedNumber(s.brier, 0, 1, 0, 4),
    refusal,
  };
}

function normalizeAltitudeRows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).flatMap((item) => {
    if (!item || !ALTITUDE_KEYS.includes(item.altitudeKey)) return [];
    return [{
      altitudeKey: item.altitudeKey,
      rank: boundedInt(item.rank, 1, 5, 1),
      activeN: boundedInt(item.activeN, 0, STRATEGY_CYCLE_LIMITS.cohortPacts),
      carryoverN: boundedInt(item.carryoverN, 0, STRATEGY_CYCLE_LIMITS.cohortPacts),
      overdueN: boundedInt(item.overdueN, 0, STRATEGY_CYCLE_LIMITS.cohortPacts),
      effortDays: boundedNumber(item.effortDays),
      suppressed: item.suppressed === true,
    }];
  });
}

function normalizeBetRows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 120).flatMap((item) => {
    const betId = idOrNull(item?.betId);
    if (!betId) return [];
    return [{
      betId,
      activeN: boundedInt(item.activeN, 0, STRATEGY_CYCLE_LIMITS.cohortPacts),
      overdueN: boundedInt(item.overdueN, 0, STRATEGY_CYCLE_LIMITS.cohortPacts),
      effortDays: boundedNumber(item.effortDays),
      declaredWeightPct: pctOrNull(item.declaredWeightPct),
      observedEffortSharePct: pctOrNull(item.observedEffortSharePct),
      releasedEffortDays: boundedNumber(item.releasedEffortDays),
      projectedEffortDays: boundedNumber(item.projectedEffortDays),
      suppressed: item.suppressed === true,
    }];
  });
}

function normalizeGrade(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gradedOn = validDay(raw.gradedOn);
  if (!gradedOn) return null;
  return {
    settledN: boundedInt(raw.settledN, 0, 100000),
    deliveredN: boundedInt(raw.deliveredN, 0, 100000),
    deliveryRatePct: pctOrNull(raw.deliveryRatePct),
    brier: raw.brier === null || raw.brier === undefined ? null : boundedNumber(raw.brier, 0, 1, 0, 4),
    gradedOn,
  };
}

export function normalizeStrategyCycleSettings(raw = {}) {
  const settings = raw && typeof raw === 'object' ? raw : {};
  return {
    strategyCycleEvidenceFloor: boundedInt(
      settings.strategyCycleEvidenceFloor,
      3,
      30,
      STRATEGY_CYCLE_DEFAULTS.strategyCycleEvidenceFloor,
    ),
    strategyCycleCellFloor: boundedInt(
      settings.strategyCycleCellFloor,
      2,
      12,
      STRATEGY_CYCLE_DEFAULTS.strategyCycleCellFloor,
    ),
    strategyCycleAutoPropagate: settings.strategyCycleAutoPropagate !== false,
  };
}

export function normalizeStrategyCycleReading(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  const scopeSeatId = idOrNull(raw.scopeSeatId);
  const altitudeKey = ALTITUDE_KEYS.includes(raw.altitudeKey) ? raw.altitudeKey : null;
  const frozenOn = validDay(raw.frozenOn);
  const reviewOn = validDay(raw.reviewOn);
  const periodStart = validDay(raw.periodStart);
  if (!id || !scopeSeatId || !altitudeKey || !frozenOn || !reviewOn || !periodStart) return null;
  const status = READING_STATUSES.includes(raw.status) ? raw.status : 'frozen';
  const cohortPactIds = [...new Set((Array.isArray(raw.cohortPactIds) ? raw.cohortPactIds : [])
    .map(idOrNull).filter(Boolean))].slice(0, STRATEGY_CYCLE_LIMITS.cohortPacts);
  const grade = normalizeGrade(raw.grade);
  const normalizedStatus = status === 'graded' && grade ? 'graded' : (status === 'lapsed' ? 'lapsed' : 'frozen');
  const sourceRevision = Number(raw.sourceRevision);
  return {
    id,
    scopeSeatId,
    // `ownerId` lets the seat policy keep a span reading inside its declared
    // subtree. The synthetic enterprise root is deliberately out of every
    // declared seat's scope; its sanitized aggregate is served by the report API.
    ownerId: scopeSeatId,
    altitudeKey,
    rank: boundedInt(raw.rank, 1, 5, 1),
    status: normalizedStatus,
    frozenOn,
    reviewOn,
    periodStart,
    windowDays: boundedInt(raw.windowDays, 1, STRATEGY_CYCLE_LIMITS.horizonDays, 30),
    sourceRevision: Number.isInteger(sourceRevision) ? Math.max(0, sourceRevision) : 0,
    previousId: idOrNull(raw.previousId),
    cohortPactIds,
    metrics: normalizeMetrics(raw.metrics),
    forecast: normalizeForecast(raw.forecast),
    byAltitude: normalizeAltitudeRows(raw.byAltitude),
    byBet: normalizeBetRows(raw.byBet),
    grade: normalizedStatus === 'graded' ? grade : null,
    createdAt: typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt))
      ? new Date(raw.createdAt).toISOString()
      : `${frozenOn}T00:00:00.000Z`,
  };
}

export function normalizeStrategyCycleReadings(raw, warnings = []) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('strategyCycles was not an array; reset to [].');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const reading = normalizeStrategyCycleReading(item);
    if (!reading) {
      warnings.push('strategyCycles: dropped a malformed frozen reading.');
      continue;
    }
    if (seen.has(reading.id)) {
      warnings.push(`strategyCycles: dropped duplicate id "${reading.id}".`);
      continue;
    }
    seen.add(reading.id);
    out.push(reading);
  }
  return out.slice(-STRATEGY_CYCLE_LIMITS.readings);
}

export function normalizeStrategyCycleMarker(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  const kind = MARKER_KINDS.includes(raw.kind) ? raw.kind : null;
  const recordedOn = validDay(raw.recordedOn);
  if (!id || !kind || !recordedOn) return null;
  return {
    id,
    kind,
    readingId: idOrNull(raw.readingId),
    betId: idOrNull(raw.betId),
    recordedOn,
  };
}

export function normalizeStrategyCycleMarkers(raw, warnings = []) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('strategyCycleMarkers was not an array; reset to [].');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const marker = normalizeStrategyCycleMarker(item);
    if (!marker) {
      warnings.push('strategyCycleMarkers: dropped a malformed idempotency marker.');
      continue;
    }
    if (seen.has(marker.id)) continue;
    seen.add(marker.id);
    out.push(marker);
  }
  return out.slice(-STRATEGY_CYCLE_LIMITS.markers);
}
