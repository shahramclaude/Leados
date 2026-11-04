/**
 * app/core/domain/catchballSchema.js — fail-closed normalizers for the Hoshin
 * Kanri & Catchball Cascade collections and conventions (Schema v89, ADR-0083).
 *
 * Malformed rows are dropped with an explicit warning rather than coerced into
 * half-valid records; out-of-range settings clamp to declared bounds.
 */

import { ALTITUDE_KEYS, altitudeByKey } from './chainRegistry.js';
import {
  CATCHBALL_BOUNDS,
  CATCHBALL_DEFAULTS,
  CATCHBALL_LIMITS,
  CORRELATION_STRENGTHS,
  COUNTER_MECHANISMS,
  GRADED_OUTCOMES,
  PACT_STATUSES,
  ROUND_KINDS,
  TRADEOFF_SOURCE_TYPES,
} from './catchballRegistry.js';

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

export function normalizeCatchballSettings(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const leadingFloor = Math.round(clampNum(
    s.catchballLeadingFloorPct,
    CATCHBALL_BOUNDS.catchballLeadingFloorPct,
    CATCHBALL_DEFAULTS.catchballLeadingFloorPct,
  ));
  const thesisRedRaw = Math.round(clampNum(
    s.catchballThesisRedPct,
    CATCHBALL_BOUNDS.catchballThesisRedPct,
    CATCHBALL_DEFAULTS.catchballThesisRedPct,
  ));
  return {
    catchballWatermelonGapPct: Math.round(clampNum(
      s.catchballWatermelonGapPct,
      CATCHBALL_BOUNDS.catchballWatermelonGapPct,
      CATCHBALL_DEFAULTS.catchballWatermelonGapPct,
    )),
    catchballLeadingFloorPct: leadingFloor,
    catchballLaggingFloorPct: Math.round(clampNum(
      s.catchballLaggingFloorPct,
      CATCHBALL_BOUNDS.catchballLaggingFloorPct,
      CATCHBALL_DEFAULTS.catchballLaggingFloorPct,
    )),
    catchballThesisRedPct: Math.min(thesisRedRaw, Math.max(10, leadingFloor - 15)),
    catchballFloorN: Math.round(clampNum(
      s.catchballFloorN,
      CATCHBALL_BOUNDS.catchballFloorN,
      CATCHBALL_DEFAULTS.catchballFloorN,
    )),
    catchballReliabilityFloorPct: Math.round(clampNum(
      s.catchballReliabilityFloorPct,
      CATCHBALL_BOUNDS.catchballReliabilityFloorPct,
      CATCHBALL_DEFAULTS.catchballReliabilityFloorPct,
    )),
    catchballCellFloor: Math.round(clampNum(
      s.catchballCellFloor,
      CATCHBALL_BOUNDS.catchballCellFloor,
      CATCHBALL_DEFAULTS.catchballCellFloor,
    )),
    catchballMaxFanout: Math.round(clampNum(
      s.catchballMaxFanout,
      CATCHBALL_BOUNDS.catchballMaxFanout,
      CATCHBALL_DEFAULTS.catchballMaxFanout,
    )),
    catchballAutoPropagate: s.catchballAutoPropagate !== false,
  };
}

export function normalizeCatchballPact(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  const title = str(raw.title, 180);
  const toSeatId = idOrNull(raw.toSeatId || raw.ownerId);
  const fromSeatId = idOrNull(raw.fromSeatId) || 'leader';
  if (!id || !title || !toSeatId) return null;
  if (!PACT_STATUSES.includes(raw.status)) return null;

  const altitudeKey = ALTITUDE_KEYS.includes(raw.altitudeKey) ? raw.altitudeKey : 'manager';
  const alt = altitudeByKey(altitudeKey);
  const horizonDays = Number.isInteger(raw.horizonDays) && raw.horizonDays > 0
    ? Math.min(730, raw.horizonDays)
    : (alt ? alt.horizonDays : 30);
  const correlation = CORRELATION_STRENGTHS.includes(raw.correlation) ? raw.correlation : 'strong';
  const effortDays = nonNegOrNull(raw.effortDays) ?? 0;

  const tradeOffSourceType = TRADEOFF_SOURCE_TYPES.includes(raw.tradeOffSourceType)
    ? raw.tradeOffSourceType
    : null;
  const tradeOffSourceId = tradeOffSourceType ? idOrNull(raw.tradeOffSourceId) : null;

  const curRaw = str(raw.currency, 3).toUpperCase();
  const currency = CURRENCY_RE.test(curRaw) ? curRaw : null;
  const resourceAskAmount = nonNegOrNull(raw.resourceAskAmount);

  const gradedOutcome = raw.status === 'settled' && GRADED_OUTCOMES.includes(raw.gradedOutcome)
    ? raw.gradedOutcome
    : null;
  if (raw.status === 'settled' && !gradedOutcome) return null;

  const createdAt = isoOrFallback(raw.createdAt);
  const updatedAt = isoOrFallback(raw.updatedAt, createdAt);

  return {
    id,
    title,
    summary: str(raw.summary, 400),
    strategyBetId: idOrNull(raw.strategyBetId),
    parentPactId: idOrNull(raw.parentPactId),
    premiseId: idOrNull(raw.premiseId),
    fromSeatId,
    toSeatId,
    // `ownerId` always mirrors `toSeatId` so `seat.js` (`recordPeople`) scopes
    // visibility to the receiving span and its leadership ancestors while
    // denying sideways peer spans.
    ownerId: toSeatId,
    altitudeKey,
    horizonDays,
    correlation,
    status: raw.status,
    leadingMetric: str(raw.leadingMetric, 140),
    leadingUnit: str(raw.leadingUnit, 40),
    leadingTarget: nonNegOrNull(raw.leadingTarget),
    leadingActual: nonNegOrNull(raw.leadingActual),
    leadingPct: pctOrNull(raw.leadingPct),
    laggingMetric: str(raw.laggingMetric, 140),
    laggingUnit: str(raw.laggingUnit, 40),
    laggingTarget: nonNegOrNull(raw.laggingTarget),
    laggingActual: nonNegOrNull(raw.laggingActual),
    laggingPct: pctOrNull(raw.laggingPct),
    reportedPct: pctOrNull(raw.reportedPct),
    effortDays,
    budgetId: idOrNull(raw.budgetId),
    currency,
    resourceAskAmount,
    encumberedLineId: idOrNull(raw.encumberedLineId),
    linkedGoalId: idOrNull(raw.linkedGoalId),
    tradeOffSourceType: tradeOffSourceId ? tradeOffSourceType : null,
    tradeOffSourceId,
    tradeOffNote: str(raw.tradeOffNote, 280),
    overloadBandAtAccept: str(raw.overloadBandAtAccept, 24) || null,
    overloadJustification: str(raw.overloadJustification, 280),
    frozenConfidencePct: pctOrNull(raw.frozenConfidencePct),
    roundCount: Math.max(1, Math.min(200, Math.round(Number(raw.roundCount) || 1))),
    startsOn: dayOrNull(raw.startsOn),
    dueOn: dayOrNull(raw.dueOn),
    agreedOn: dayOrNull(raw.agreedOn),
    gradedOn: gradedOutcome ? (dayOrNull(raw.gradedOn) || createdAt.slice(0, 10)) : null,
    gradedOutcome,
    gradeNote: gradedOutcome ? str(raw.gradeNote, 280) : '',
    createdAt,
    updatedAt,
  };
}

export function normalizeCatchballPacts(raw, warnings = []) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('catchballPacts was not an array; reset to [].');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeCatchballPact(item);
    if (!row) {
      warnings.push('catchballPacts: dropped a malformed pact record.');
      continue;
    }
    if (seen.has(row.id)) {
      warnings.push(`catchballPacts: dropped duplicate id "${row.id}".`);
      continue;
    }
    seen.add(row.id);
    out.push(row);
  }
  return out.slice(-CATCHBALL_LIMITS.pacts);
}

export function normalizeCatchballRound(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  const pactId = idOrNull(raw.pactId);
  const ownerId = idOrNull(raw.ownerId);
  const actorSeatId = idOrNull(raw.actorSeatId) || 'leader';
  if (!id || !pactId || !ownerId) return null;
  if (!ROUND_KINDS.includes(raw.kind)) return null;

  const mechanism = COUNTER_MECHANISMS.includes(raw.mechanism) ? raw.mechanism : 'none';
  const tradeOffSourceType = TRADEOFF_SOURCE_TYPES.includes(raw.tradeOffSourceType)
    ? raw.tradeOffSourceType
    : null;
  const tradeOffSourceId = tradeOffSourceType ? idOrNull(raw.tradeOffSourceId) : null;
  const curRaw = str(raw.currency, 3).toUpperCase();
  const currency = CURRENCY_RE.test(curRaw) ? curRaw : null;
  const createdAt = isoOrFallback(raw.createdAt);

  return {
    id,
    pactId,
    roundNumber: Math.max(1, Math.min(500, Math.round(Number(raw.roundNumber) || 1))),
    kind: raw.kind,
    actorSeatId,
    ownerId,
    mechanism,
    proposedEffortDays: nonNegOrNull(raw.proposedEffortDays),
    proposedLaggingTarget: nonNegOrNull(raw.proposedLaggingTarget),
    proposedDueOn: dayOrNull(raw.proposedDueOn),
    resourceAskAmount: nonNegOrNull(raw.resourceAskAmount),
    currency,
    tradeOffSourceType: tradeOffSourceId ? tradeOffSourceType : null,
    tradeOffSourceId,
    leadingPct: pctOrNull(raw.leadingPct),
    laggingPct: pctOrNull(raw.laggingPct),
    reportedPct: pctOrNull(raw.reportedPct),
    confidencePct: pctOrNull(raw.confidencePct),
    note: str(raw.note, 320),
    recordedOn: dayOrNull(raw.recordedOn) || createdAt.slice(0, 10),
    createdAt,
  };
}

export function normalizeCatchballRounds(raw, warnings = []) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('catchballRounds was not an array; reset to [].');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeCatchballRound(item);
    if (!row) {
      warnings.push('catchballRounds: dropped a malformed round record.');
      continue;
    }
    if (seen.has(row.id)) {
      warnings.push(`catchballRounds: dropped duplicate id "${row.id}".`);
      continue;
    }
    seen.add(row.id);
    out.push(row);
  }
  return out.slice(-CATCHBALL_LIMITS.rounds);
}

export function normalizeCatchballMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const key = str(item.key || item.id, 140);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: idOrNull(item.id) || `hkm-${out.length + 1}`,
      key,
      kind: str(item.kind, 40) || 'advisory',
      recordedOn: dayOrNull(item.recordedOn) || '1970-01-01',
      summary: str(item.summary, 240),
    });
  }
  return out.slice(-CATCHBALL_LIMITS.markers);
}
