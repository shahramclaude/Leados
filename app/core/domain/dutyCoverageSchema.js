/**
 * app/core/domain/dutyCoverageSchema.js — fail-closed normalizers for the Duty
 * Coverage Register (ADR-0121, Schema v114).
 *
 * WHAT IS STORED, AND WHAT MUST NEVER BE
 * --------------------------------------
 * A `dutyCovers` row stores exactly the human act and its provenance:
 *   dutyId    an opaque, stable key `<seatId>|<dutyKey>` (a duty belongs to a
 *             DECLARED SEAT, not to whoever happens to sit in it today — a
 *             resignation must not silently orphan the cover),
 *   coverId   the person declared answerable,
 *   note      the words the declaring leader wrote (clamped, never summarised),
 *   decisionId the governed decision opened in the same transaction,
 *   status    active | revoked, with the revocation day and reason.
 *
 * What it never stores: a rating of the cover, a coverage percentage, the
 * derived "eligible pool", the duty's span holder, or any copy of another
 * module's record. Those are re-derived on read from the reporting tree and the
 * dated records that already exist. A stored copy of a derived figure is a
 * number that drifts from the number it reports.
 *
 * A malformed row is DROPPED with a printed warning, never repaired into a
 * plausible-looking cover: an invented stand-in is an invented responsibility.
 */

import {
  DUTY_COVERAGE_BOUNDS,
  DUTY_COVERAGE_DEFAULTS,
  DUTY_COVERAGE_ENGINE_VERSION,
  DUTY_COVERAGE_LIMITS,
  DUTY_COVERAGE_STATUSES,
} from './dutyCoverageRegistry.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function id(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value.trim()) ? value.trim() : null;
}

function stamp(value) {
  const s = text(value, 40);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function day(value) {
  const s = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

/** `<seatId>|<dutyKey>` — both halves must be opaque, bounded identifiers. */
export function parseDutyId(dutyId) {
  const raw = typeof dutyId === 'string' ? dutyId.trim() : '';
  const parts = raw.split('|');
  if (parts.length !== 2) return null;
  const seatId = id(parts[0]);
  const dutyKey = typeof parts[1] === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(parts[1]) ? parts[1] : null;
  if (!seatId || !dutyKey) return null;
  return { seatId, dutyKey, dutyId: `${seatId}|${dutyKey}` };
}

export function makeDutyId(seatId, dutyKey) {
  const parsed = parseDutyId(`${seatId}|${dutyKey}`);
  return parsed ? parsed.dutyId : null;
}

/**
 * The cover ledger. Duplicate (duty, cover) pairs are corruption, not rotation —
 * the action's write path replaces a revoked row rather than stacking rows.
 */
export function normalizeDutyCovers(value, warnings = []) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  let activePerDuty = new Map();
  for (const raw of value) {
    if (!isPlainObject(raw)) {
      warnings.push('Duty cover: dropped a malformed cover row (not an object).');
      continue;
    }
    const rowId = id(raw.id);
    const parsed = parseDutyId(raw.dutyId);
    const coverId = id(raw.coverId);
    const declaredOn = day(raw.declaredOn);
    const declaredAt = stamp(raw.declaredAt);
    const status = DUTY_COVERAGE_STATUSES.includes(raw.status) ? raw.status : null;
    if (!rowId || !parsed || !coverId || !declaredOn || !declaredAt || !status) {
      warnings.push('Duty cover: dropped an incomplete cover row; no stand-in was inferred.');
      continue;
    }
    const key = `${parsed.dutyId}|${coverId}`;
    if (seen.has(key)) {
      warnings.push('Duty cover: dropped a duplicate cover for one duty and one person.');
      continue;
    }
    seen.add(key);
    const activeN = activePerDuty.get(parsed.dutyId) || 0;
    if (status === 'active' && activeN >= DUTY_COVERAGE_LIMITS.coversPerDuty) {
      warnings.push(`Duty cover: “${parsed.dutyId}” already carries its declared maximum of ${DUTY_COVERAGE_LIMITS.coversPerDuty} active covers; the extra row was dropped rather than silently widening the duty.`);
      continue;
    }
    if (status === 'active') activePerDuty.set(parsed.dutyId, activeN + 1);
    if (out.length >= DUTY_COVERAGE_LIMITS.ledgerCap) {
      warnings.push('Duty cover: ledger cap reached; additional rows were not loaded.');
      break;
    }
    out.push({
      id: rowId,
      dutyId: parsed.dutyId,
      seatId: parsed.seatId,
      dutyKey: parsed.dutyKey,
      coverId,
      note: text(raw.note, DUTY_COVERAGE_LIMITS.noteChars),
      decisionId: id(raw.decisionId),
      declaredBySeatId: id(raw.declaredBySeatId),
      declaredOn,
      declaredAt,
      status,
      revokedOn: day(raw.revokedOn),
      revokedAt: stamp(raw.revokedAt),
      revokeReason: text(raw.revokeReason, DUTY_COVERAGE_LIMITS.reasonChars),
      verifiedOn: day(raw.verifiedOn),
      version: versionSafe(raw.version),
    });
  }
  return out;
}

function versionSafe(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 60) : DUTY_COVERAGE_ENGINE_VERSION;
}

/** Idempotency markers: opaque tags, trimmed, de-duplicated and capped. */
export function normalizeDutyCoverageMarkers(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().slice(0, 160);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 400) break;
  }
  return out;
}

const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/**
 * Declared conventions. A value that is present but out of range CLAMPS to the
 * boundary (\"as far as it goes\"); a value that is not a number falls back to
 * the printed default. Never \"the most permissive reading\".
 */
export function normalizeDutyCoverageSettings(settings = {}) {
  const s = isPlainObject(settings) ? settings : {};
  const d = DUTY_COVERAGE_DEFAULTS;
  return {
    dutyCoverageExerciseDays: clampInt(s.dutyCoverageExerciseDays, ...DUTY_COVERAGE_BOUNDS.dutyCoverageExerciseDays, d.dutyCoverageExerciseDays),
    dutyCoverageConcentrationPct: clampInt(s.dutyCoverageConcentrationPct, ...DUTY_COVERAGE_BOUNDS.dutyCoverageConcentrationPct, d.dutyCoverageConcentrationPct),
    // ADR-0126: the branch-comparison disclosure floor. Withheld cells are
    // printed as withheld, never as zero, and the floor is re-declarable only
    // by the same rank-4+ full-access seat that declares the other two.
    dutyCoverageBranchFloorN: clampInt(s.dutyCoverageBranchFloorN, ...DUTY_COVERAGE_BOUNDS.dutyCoverageBranchFloorN, d.dutyCoverageBranchFloorN),
    dutyCoverageBranchRateFloorN: clampInt(s.dutyCoverageBranchRateFloorN, ...DUTY_COVERAGE_BOUNDS.dutyCoverageBranchRateFloorN, d.dutyCoverageBranchRateFloorN),
    dutyCoverageBranchCap: clampInt(s.dutyCoverageBranchCap, ...DUTY_COVERAGE_BOUNDS.dutyCoverageBranchCap, d.dutyCoverageBranchCap),
    // ADR-0129: how long a branch leader has to answer a reading request, and
    // how long a published reading stands before it lapses. Clamped, printed,
    // and re-declarable only by the rank-4+/full-access seat that declares the
    // disclosure floors — the two are the same governance question: how little
    // the enterprise is allowed to know, and for how long it may keep knowing it.
    dutyCoverageReadingResponseDays: clampInt(s.dutyCoverageReadingResponseDays, ...DUTY_COVERAGE_BOUNDS.dutyCoverageReadingResponseDays, d.dutyCoverageReadingResponseDays),
    dutyCoverageReadingValidDays: clampInt(s.dutyCoverageReadingValidDays, ...DUTY_COVERAGE_BOUNDS.dutyCoverageReadingValidDays, d.dutyCoverageReadingValidDays),
  };
}
