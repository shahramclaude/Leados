/**
 * app/core/domain/carryoverSchema.js — fail-closed normalizers for the Hoshin
 * Carryover Terminal collections and conventions (Schema v91, ADR-0089).
 *
 * Malformed rows are dropped with an explicit warning rather than coerced into
 * half-valid records; out-of-range settings clamp to declared bounds.
 */

import {
  CARRYOVER_BOUNDS,
  CARRYOVER_DEFAULTS,
  CARRYOVER_LIMITS,
  CARRYOVER_STATUSES,
  CARRYOVER_VERDICT_KEYS,
  CARRYOVER_BET_BASES,
  CARRYOVER_RELEASE_OUTCOMES,
} from './carryoverRegistry.js';

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

function nonNegOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function normalizeCarryoverSettings(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    carryoverCellFloor: Math.round(clampNum(
      s.carryoverCellFloor,
      CARRYOVER_BOUNDS.carryoverCellFloor,
      CARRYOVER_DEFAULTS.carryoverCellFloor,
    )),
    carryoverReliabilityFloorPct: Math.round(clampNum(
      s.carryoverReliabilityFloorPct,
      CARRYOVER_BOUNDS.carryoverReliabilityFloorPct,
      CARRYOVER_DEFAULTS.carryoverReliabilityFloorPct,
    )),
    carryoverGradingDelayDays: Math.round(clampNum(
      s.carryoverGradingDelayDays,
      CARRYOVER_BOUNDS.carryoverGradingDelayDays,
      CARRYOVER_DEFAULTS.carryoverGradingDelayDays,
    )),
    carryoverDecisionReviewDays: Math.round(clampNum(
      s.carryoverDecisionReviewDays,
      CARRYOVER_BOUNDS.carryoverDecisionReviewDays,
      CARRYOVER_DEFAULTS.carryoverDecisionReviewDays,
    )),
    carryoverAutoPropagate: s.carryoverAutoPropagate !== false,
  };
}

/**
 * A carryover record: one row per Catchball pact settled as
 * `thesis-invalidated`, carrying the resolved bet, the resource bundle the
 * settlement decision acts on, and the once-only later grade.
 */
export function normalizeCarryoverRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  const pactId = idOrNull(raw.pactId);
  if (!id || !pactId) return null;
  if (!CARRYOVER_STATUSES.includes(raw.status)) return null;

  const betId = idOrNull(raw.betId);
  const betBasis = CARRYOVER_BET_BASES.includes(raw.betBasis) ? raw.betBasis : 'unresolved';
  const settlementDecisionId = idOrNull(raw.settlementDecisionId);
  const settlementVerdict = CARRYOVER_VERDICT_KEYS.includes(raw.settlementVerdict) ? raw.settlementVerdict : null;
  const settledOn = dayOrNull(raw.settledOn);
  const releasedOn = dayOrNull(raw.releasedOn);
  const releaseOutcome = CARRYOVER_RELEASE_OUTCOMES.includes(raw.releaseOutcome) ? raw.releaseOutcome : null;

  const resourceRaw = raw.resource && typeof raw.resource === 'object' ? raw.resource : {};
  const curRaw = str(resourceRaw.currency, 3).toUpperCase();
  const resource = {
    effortDays: nonNegOrNull(resourceRaw.effortDays) ?? 0,
    budgetId: idOrNull(resourceRaw.budgetId),
    budgetName: str(resourceRaw.budgetName, 160),
    encumberedLineId: idOrNull(resourceRaw.encumberedLineId),
    currency: CURRENCY_RE.test(curRaw) ? curRaw : null,
    committedAmount: nonNegOrNull(resourceRaw.committedAmount),
    lineStatus: str(resourceRaw.lineStatus, 24) || null,
  };

  const createdAt = isoOrFallback(raw.createdAt);
  return {
    id,
    pactId,
    betId,
    betBasis,
    status: raw.status,
    settlementDecisionId,
    settlementVerdict,
    settledOn,
    releasedOn,
    releaseOutcome,
    releaseReason: str(raw.releaseReason, 400),
    resource,
    graded: raw.graded === true,
    grade: raw.grade && typeof raw.grade === 'object' ? raw.grade : null,
    createdAt,
    updatedAt: isoOrFallback(raw.updatedAt, createdAt),
  };
}

export function normalizeCarryoverRecords(raw, warnings = []) {
  const rows = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of rows) {
    const row = normalizeCarryoverRecord(item);
    if (!row) {
      warnings.push('Carryover: dropped a malformed carryover record (missing id, pactId or status).');
      continue;
    }
    if (seen.has(row.id)) {
      warnings.push(`Carryover: dropped a duplicate carryover record id ${row.id}.`);
      continue;
    }
    seen.add(row.id);
    out.push(row);
  }
  if (out.length > CARRYOVER_LIMITS.records) {
    warnings.push(`Carryover: ${out.length - CARRYOVER_LIMITS.records} oldest carryover record(s) evicted (cap ${CARRYOVER_LIMITS.records}).`);
    out.splice(0, out.length - CARRYOVER_LIMITS.records);
  }
  return out;
}

/** Idempotency markers for the four rules (keyed, capped, append-only). */
export function normalizeCarryoverMarkers(raw, warnings = []) {
  const rows = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const key = str(item.key, 200);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: idOrNull(item.id) || `hkm-${out.length + 1}`,
      key,
      kind: str(item.kind, 40) || 'marker',
      recordedOn: dayOrNull(item.recordedOn) || null,
      summary: str(item.summary, 240),
    });
  }
  if (out.length > CARRYOVER_LIMITS.markers) {
    out.splice(0, out.length - CARRYOVER_LIMITS.markers);
  }
  return out;
}

/**
 * Once-only, later grading rows. Frozen at grading time; never rewritten.
 * Each row: the record id (opaque), the bet altitude cell, the settlement
 * outcome and the release outcome, graded against the prediction frozen when
 * the settlement decision was opened.
 */
export function normalizeCarryoverGradings(raw, warnings = []) {
  const rows = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const recordId = idOrNull(item.recordId);
    if (!recordId || seen.has(recordId)) continue;
    seen.add(recordId);
    out.push({
      id: idOrNull(item.id) || `cog-${out.length + 1}`,
      recordId,
      gradedOn: dayOrNull(item.gradedOn) || null,
      altitudeKey: str(item.altitudeKey, 24) || null,
      settlementOutcome: str(item.settlementOutcome, 24) || null,
      releaseOutcome: str(item.releaseOutcome, 24) || null,
      settledWithinWindow: item.settledWithinWindow === true,
      predictedSettlementPct: nonNegOrNull(item.predictedSettlementPct),
      note: str(item.note, 280),
    });
  }
  if (out.length > CARRYOVER_LIMITS.gradings) {
    out.splice(0, out.length - CARRYOVER_LIMITS.gradings);
  }
  return out;
}
