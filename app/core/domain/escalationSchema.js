/**
 * app/core/domain/escalationSchema.js — fail-closed normalizers for the
 * Escalation Economy collections and conventions (Schema v94, ADR-0088).
 *
 * Malformed rows are dropped with an explicit warning rather than coerced into
 * half-valid records; out-of-range settings clamp to declared bounds. Nothing
 * here invents a disposition, a resolution, a cost or an outcome: a workspace
 * that never logged a decision moment stays empty until a human logs one.
 */

import { ALTITUDE_KEYS } from './chainRegistry.js';
import {
  DEFENSIVE_REASONS,
  DISPOSITIONS,
  ESCALATION_BOUNDS,
  ESCALATION_DEFAULTS,
  ESCALATION_LIMITS,
  ESCALATION_REASONS,
  RECORD_STATUSES,
  RESOLUTIONS,
  SOURCE_TYPES,
} from './escalationRegistry.js';

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
function str(v, max = 240) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function idOrNull(v) {
  const s = str(v, 80);
  return s || null;
}

function dayOrNull(v) {
  const s = str(v, 10);
  if (!ISO_DAY_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

function isoOrFallback(v, fallback = '1970-01-01T00:00:00.000Z') {
  if (typeof v !== 'string' || !v.trim()) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

function clampNum(v, [lo, hi], fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function pctOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}

function nonNegOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function normalizeEscalationSettings(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const num = (key) => clampNum(s[key], ESCALATION_BOUNDS[key], ESCALATION_DEFAULTS[key]);
  const rate = (key) => Math.round(clampNum(s[key], ESCALATION_BOUNDS[key], ESCALATION_DEFAULTS[key]) * 100) / 100;
  const cur = str(s.escalationCurrency, 3).toUpperCase();
  return {
    escalationFloorN: Math.round(num('escalationFloorN')),
    escalationCellFloor: Math.round(num('escalationCellFloor')),
    escalationWindowDays: Math.round(num('escalationWindowDays')),
    escalationYieldFloorPct: Math.round(num('escalationYieldFloorPct')),
    escalationRateRedPct: Math.round(num('escalationRateRedPct')),
    escalationUtilisationRedPct: Math.round(num('escalationUtilisationRedPct')),
    escalationServiceRatePerWeek: Math.round(num('escalationServiceRatePerWeek') * 100) / 100,
    escalationServiceScv: Math.round(num('escalationServiceScv') * 100) / 100,
    escalationContextLossPerRungPct: Math.round(num('escalationContextLossPerRungPct') * 10) / 10,
    escalationReturnDays: Math.round(num('escalationReturnDays')),
    escalationReviewDays: Math.round(num('escalationReviewDays')),
    escalationHoursPerEscalation: Math.round(num('escalationHoursPerEscalation') * 100) / 100,
    escalationCurrency: CURRENCY_RE.test(cur) ? cur : ESCALATION_DEFAULTS.escalationCurrency,
    escalationRateFrontline: rate('escalationRateFrontline'),
    escalationRateManager: rate('escalationRateManager'),
    escalationRateDirector: rate('escalationRateDirector'),
    escalationRateExec: rate('escalationRateExec'),
    escalationRateChief: rate('escalationRateChief'),
    escalationAutoPropagate: s.escalationAutoPropagate !== false,
  };
}

/**
 * One decision moment: an item arose at `fromSeatId` and was either absorbed
 * there or escalated to `toSeatId`. `ownerId` always mirrors `fromSeatId` so
 * `seat.js` scopes visibility to the originating span and its leadership
 * ancestors while denying sideways peer spans.
 */
export function normalizeEscalationRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  const title = str(raw.title, 180);
  const fromSeatId = idOrNull(raw.fromSeatId) || 'leader';
  if (!id || !title || !fromSeatId) return null;
  if (!DISPOSITIONS.includes(raw.disposition)) return null;
  if (!RECORD_STATUSES.includes(raw.status)) return null;
  if (!ESCALATION_REASONS.includes(raw.reasonKey)) return null;

  const toSeatId = idOrNull(raw.toSeatId);
  // An escalated item must name a receiver; an absorbed one must not. A row
  // that contradicts its own disposition is dropped, never silently repaired.
  if (raw.disposition === 'escalated' && !toSeatId) return null;
  if (raw.disposition === 'absorbed' && toSeatId) return null;

  const settled = raw.status === 'settled' || raw.status === 'returned';
  const resolution = settled && RESOLUTIONS.includes(raw.resolution) ? raw.resolution : null;
  if (settled && !resolution) return null;
  // Only a settled ESCALATION can be returned downward or overruled.
  if (resolution === 'returned' && raw.status !== 'returned') return null;

  const sourceType = SOURCE_TYPES.includes(raw.sourceType) ? raw.sourceType : null;
  const sourceId = sourceType ? idOrNull(raw.sourceId) : null;

  // `outcomeDiffers` is a human record, never inferred from a title or a note.
  const outcomeDiffers = resolution && resolution !== 'returned'
    ? (raw.outcomeDiffers === true ? true : raw.outcomeDiffers === false ? false : null)
    : null;

  const createdAt = isoOrFallback(raw.createdAt);
  const loggedOn = dayOrNull(raw.loggedOn) || createdAt.slice(0, 10);
  const decidedOn = settled ? (dayOrNull(raw.decidedOn) || loggedOn) : null;

  return {
    id,
    title,
    note: str(raw.note, 400),
    disposition: raw.disposition,
    fromSeatId,
    toSeatId: toSeatId || null,
    ownerId: fromSeatId,
    reasonKey: raw.reasonKey,
    decisionClass: str(raw.decisionClass, 60) || 'general',
    sourceType: sourceId ? sourceType : null,
    sourceId,
    proposedAction: str(raw.proposedAction, 240),
    status: raw.status,
    resolution,
    outcomeDiffers,
    effortHours: nonNegOrNull(raw.effortHours),
    loggedOn,
    decidedOn,
    createdAt,
    updatedAt: isoOrFallback(raw.updatedAt, createdAt),
  };
}

export function normalizeEscalationRecords(raw, warnings = []) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('escalationRecords was not an array; reset to [].');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeEscalationRecord(item);
    if (!row) {
      warnings.push('escalationRecords: dropped a malformed escalation record.');
      continue;
    }
    if (seen.has(row.id)) {
      warnings.push(`escalationRecords: dropped duplicate id "${row.id}".`);
      continue;
    }
    seen.add(row.id);
    out.push(row);
  }
  return out.slice(-ESCALATION_LIMITS.records);
}

/**
 * An Aghion–Tirole intervention-rate commitment: a receiving span declares how
 * often it WILL intervene over a period, so the levels below it can justify
 * gathering information instead of pre-emptively escalating. Frozen on
 * declaration, graded once after `reviewOn`, refused below the evidence floor.
 */
export function normalizeEscalationCommitment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  const spanId = idOrNull(raw.spanId);
  if (!id || !spanId) return null;
  // `periodKey` is the Monday-based week START as an ISO day, using the same
  // `weekKey` convention as every other module in the workspace.
  const periodKey = str(raw.periodKey, 10);
  if (!ISO_DAY_RE.test(periodKey)) return null;

  const committedRate = pctOrNull(raw.committedInterventionRatePct);
  const forecast = pctOrNull(raw.forecastPct);
  if (committedRate === null || forecast === null) return null;

  const graded = raw.status === 'graded';
  const observedRate = pctOrNull(raw.observedInterventionRatePct);
  const observedCount = Number.isFinite(Number(raw.observedEscalationCount))
    ? Math.max(0, Math.round(Number(raw.observedEscalationCount)))
    : null;
  if (graded && (observedRate === null || observedCount === null)) return null;

  const declaredOn = dayOrNull(raw.declaredOn) || '1970-01-01';
  const createdAt = isoOrFallback(raw.createdAt);

  // Brier = (p − o)² over the binary "we stay inside the declared budget".
  // Computed here from the frozen forecast and the graded outcome so a
  // reloaded workspace can never silently re-grade with a different formula.
  let brier = null;
  let kept = null;
  if (graded && observedCount !== null) {
    const budget = Math.max(0, Math.round(Number(raw.committedEscalationBudget) || 0));
    kept = observedCount <= budget ? 1 : 0;
    const p = forecast / 100;
    brier = Math.round((p - kept) ** 2 * 1e6) / 1e6;
  }

  return {
    id,
    spanId,
    ownerId: spanId,
    decisionClass: str(raw.decisionClass, 60) || '*',
    periodKey,
    altitudeKey: ALTITUDE_KEYS.includes(raw.altitudeKey) ? raw.altitudeKey : 'manager',
    committedInterventionRatePct: committedRate,
    committedEscalationBudget: Math.max(0, Math.round(Number(raw.committedEscalationBudget) || 0)),
    forecastPct: forecast,
    declaredOn,
    reviewOn: dayOrNull(raw.reviewOn) || declaredOn,
    status: graded ? 'graded' : 'declared',
    observedInterventionRatePct: graded ? observedRate : null,
    observedEscalationCount: graded ? observedCount : null,
    observedN: graded ? Math.max(0, Math.round(Number(raw.observedN) || 0)) : null,
    gradedOn: graded ? (dayOrNull(raw.gradedOn) || declaredOn) : null,
    keptWithinBudget: kept,
    brier,
    note: str(raw.note, 400),
    createdAt,
  };
}

export function normalizeEscalationCommitments(raw, warnings = []) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('escalationCommitments was not an array; reset to [].');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeEscalationCommitment(item);
    if (!row) {
      warnings.push('escalationCommitments: dropped a malformed commitment record.');
      continue;
    }
    const dedupe = `${row.spanId}|${row.decisionClass}|${row.periodKey}`;
    if (seen.has(dedupe)) {
      warnings.push(`escalationCommitments: dropped duplicate commitment "${dedupe}".`);
      continue;
    }
    seen.add(dedupe);
    out.push(row);
  }
  return out.slice(-ESCALATION_LIMITS.commitments);
}

export function normalizeEscalationMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const key = str(item.key || item.id, 140);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: idOrNull(item.id) || `escm-${out.length + 1}`,
      key,
      kind: str(item.kind, 40) || 'advisory',
      recordedOn: dayOrNull(item.recordedOn) || '1970-01-01',
      summary: str(item.summary, 240),
    });
  }
  return out.slice(-ESCALATION_LIMITS.markers);
}

export { DEFENSIVE_REASONS };
