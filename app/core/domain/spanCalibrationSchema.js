/**
 * app/core/domain/spanCalibrationSchema.js — Schema v102 stored contract
 * (ADR-0100, the Discretion Calibrator).
 *
 * Three ledgers, each with one rule:
 *
 *  - **`spanReadings`** — a frozen calibration. Immutable in the fields that
 *    make it a claim: the per-rung verdicts, the interval, the proposed table
 *    and the quoted probability per rung. A malformed reading is DROPPED with a
 *    warning; it is never repaired into a verdict a leader might adopt.
 *  - **`spanAdoptions`** — the dated, append-only record of every ladder a human
 *    put in force, with the reading that justified it and the before/after table.
 *    The settings key `chainAdoptedHorizons` is the fast read; this ledger is the
 *    history, and the history is what makes an adoption auditable and reversible.
 *  - **`spanMarkers`** — idempotency for the rule spine.
 *
 * Conventions are declared, clamped and printed. Nothing here is fitted.
 */
import { dayKey } from '../time.js';
import {
  SPAN_DEFAULTS,
  SPAN_LIMITS,
  SPAN_VERDICT_KEYS,
} from './spanCalibrationRegistry.js';
import { ALTITUDE_KEYS } from './chainRegistry.js';

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function clean(text, max) {
  return str(text).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function day(value) {
  const raw = str(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function intOrNull(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------------------------------------- conventions */

export function normalizeSpanCalibrationSettings(raw) {
  const s = isPlainObject(raw) ? raw : {};
  const d = SPAN_DEFAULTS;
  return {
    spanCalibrationCoveragePct: clampInt(s.spanCalibrationCoveragePct, SPAN_LIMITS.coverageMin, SPAN_LIMITS.coverageMax, d.spanCalibrationCoveragePct),
    spanCalibrationDecidedFloor: clampInt(s.spanCalibrationDecidedFloor, SPAN_LIMITS.decidedFloorMin, SPAN_LIMITS.decidedFloorMax, d.spanCalibrationDecidedFloor),
    spanCalibrationCensoringPct: clampInt(s.spanCalibrationCensoringPct, SPAN_LIMITS.censoringPctMin, SPAN_LIMITS.censoringPctMax, d.spanCalibrationCensoringPct),
    spanCalibrationRiskFloor: clampInt(s.spanCalibrationRiskFloor, SPAN_LIMITS.riskFloorMin, SPAN_LIMITS.riskFloorMax, d.spanCalibrationRiskFloor),
    spanCalibrationCellFloor: clampInt(s.spanCalibrationCellFloor, SPAN_LIMITS.cellFloorMin, SPAN_LIMITS.cellFloorMax, d.spanCalibrationCellFloor),
    spanCalibrationReviewDays: clampInt(s.spanCalibrationReviewDays, SPAN_LIMITS.reviewDaysMin, SPAN_LIMITS.reviewDaysMax, d.spanCalibrationReviewDays),
    spanCalibrationAdoptMinPct: clampInt(s.spanCalibrationAdoptMinPct, SPAN_LIMITS.adoptMinPctMin, SPAN_LIMITS.adoptMinPctMax, d.spanCalibrationAdoptMinPct),
    spanCalibrationAdoptMaxPct: clampInt(s.spanCalibrationAdoptMaxPct, SPAN_LIMITS.adoptMaxPctMin, SPAN_LIMITS.adoptMaxPctMax, d.spanCalibrationAdoptMaxPct),
    spanCalibrationMaxWidthPct: clampInt(s.spanCalibrationMaxWidthPct, SPAN_LIMITS.maxWidthPctMin, SPAN_LIMITS.maxWidthPctMax, d.spanCalibrationMaxWidthPct),
    spanCalibrationBandPct: clampInt(s.spanCalibrationBandPct, 80, 99, 90),
    spanCalibrationAutoPropagate: s.spanCalibrationAutoPropagate !== false,
  };
}

/** The conventions the engine reads, in the shape it reads them. */
export function spanCalibrationConventions(settings = {}) {
  const s = isPlainObject(settings) ? settings : {};
  const normalized = normalizeSpanCalibrationSettings(s);
  return {
    coveragePct: normalized.spanCalibrationCoveragePct,
    decidedFloor: normalized.spanCalibrationDecidedFloor,
    censoringPct: normalized.spanCalibrationCensoringPct,
    riskFloor: normalized.spanCalibrationRiskFloor,
    cellFloor: normalized.spanCalibrationCellFloor,
    reviewDays: normalized.spanCalibrationReviewDays,
    adoptMinPct: normalized.spanCalibrationAdoptMinPct,
    adoptMaxPct: normalized.spanCalibrationAdoptMaxPct,
    maxWidthPct: normalized.spanCalibrationMaxWidthPct,
    bandPct: normalized.spanCalibrationBandPct,
    ladderStepMax: SPAN_LIMITS.ladderStepMax,
    autoPropagate: normalized.spanCalibrationAutoPropagate,
  };
}

/**
 * The adopted ladder, as stored. A key that is missing or out of band falls back
 * to the declared span, and the sequence is forced strictly increasing, so a
 * hand-edited settings object can never produce a ladder that runs downhill.
 */
export function normalizeAdoptedHorizons(raw, declared = {}) {
  if (!isPlainObject(raw)) return null;
  const out = {};
  let previous = 0;
  let used = false;
  for (const key of ALTITUDE_KEYS) {
    const declaredDays = Number(declared[key]);
    const value = Number(raw[key]);
    if (!Number.isFinite(value) || value <= 0) {
      if (Number.isFinite(declaredDays) && declaredDays > 0) out[key] = Math.max(previous + 1, Math.round(declaredDays));
      continue;
    }
    used = true;
    const next = Math.max(previous + 1, Math.round(value));
    out[key] = next;
    previous = next;
  }
  return used ? out : null;
}

/* ------------------------------------------------------------- readings */

function normalizeRungRow(raw) {
  if (!isPlainObject(raw)) return null;
  const key = str(raw.key);
  if (!ALTITUDE_KEYS.includes(key)) return null;
  const verdict = SPAN_VERDICT_KEYS.includes(raw.verdict) ? raw.verdict : null;
  if (!verdict) return null;
  const declaredDays = intOrNull(raw.declaredDays);
  if (!Number.isFinite(declaredDays) || declaredDays <= 0) return null;
  const survival = raw.survivalAtDeclaredPct === null || raw.survivalAtDeclaredPct === undefined
    ? null
    : Math.min(100, Math.max(0, Number(raw.survivalAtDeclaredPct)));
  return {
    key,
    rank: clampInt(raw.rank, 1, 5, 1),
    declaredDays,
    decidedN: clampInt(raw.decidedN, 0, 1e6, 0),
    censoredN: clampInt(raw.censoredN, 0, 1e6, 0),
    censoringPct: raw.censoringPct === null || raw.censoringPct === undefined ? null : Math.min(100, Math.max(0, Number(raw.censoringPct))),
    measuredDays: intOrNull(raw.measuredDays),
    pooledMeasuredDays: intOrNull(raw.pooledMeasuredDays),
    pooled: raw.pooled === true,
    ciLo: intOrNull(raw.ciLo),
    ciHi: intOrNull(raw.ciHi),
    survivalAtDeclaredPct: survival === null || !Number.isFinite(survival) ? null : Math.round(survival * 10) / 10,
    survivalAtDeclaredLoPct: raw.survivalAtDeclaredLoPct === null || raw.survivalAtDeclaredLoPct === undefined ? null : Math.round(Number(raw.survivalAtDeclaredLoPct) * 10) / 10,
    survivalAtDeclaredHiPct: raw.survivalAtDeclaredHiPct === null || raw.survivalAtDeclaredHiPct === undefined ? null : Math.round(Number(raw.survivalAtDeclaredHiPct) * 10) / 10,
    verdict,
    reason: clean(raw.reason, 400),
  };
}

function normalizeLadderTable(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const key = str(row.key);
    const days = intOrNull(row.days ?? row.declaredDays);
    if (!ALTITUDE_KEYS.includes(key) || !Number.isFinite(days) || days <= 0) continue;
    out.push({
      key,
      days,
      declaredDays: intOrNull(row.declaredDays),
      source: row.source === 'measured' ? 'measured' : 'declared',
    });
  }
  return out;
}

export function normalizeSpanReadings(raw, warnings = [], { now = new Date() } = {}) {
  const rows = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isPlainObject(row) || !row.id || seen.has(row.id)) continue;
    const frozenOn = day(row.frozenOn);
    const reviewOn = day(row.reviewOn);
    if (!frozenOn || !reviewOn) {
      warnings.push(`A frozen span-calibration reading (${row.id}) has no valid freeze/review date and was dropped rather than repaired.`);
      continue;
    }
    const rungs = (Array.isArray(row.rungs) ? row.rungs : []).map(normalizeRungRow).filter(Boolean);
    if (!rungs.length) {
      warnings.push(`A frozen span-calibration reading (${row.id}) carries no valid rung and was dropped: it could not support an adoption.`);
      continue;
    }
    const quoted = rungs.filter((rung) => rung.survivalAtDeclaredPct !== null).length;
    seen.add(row.id);
    out.push({
      id: str(row.id),
      frozenOn,
      reviewOn,
      reviewDays: clampInt(row.reviewDays, 1, 3650, 90),
      coveragePct: clampInt(row.coveragePct, 1, 99, 85),
      decidedFloor: clampInt(row.decidedFloor, 1, 10000, 8),
      censoringPct: clampInt(row.censoringPct, 1, 100, 60),
      riskFloor: clampInt(row.riskFloor, 1, 10000, 3),
      bandPct: clampInt(row.bandPct, 50, 99, 90),
      ladderSource: row.ladderSource === 'calibrated' ? 'calibrated' : 'declared',
      adoptedOn: day(row.adoptedOn),
      declaredLadder: normalizeLadderTable(row.declaredLadder),
      proposedLadder: normalizeLadderTable(row.proposedLadder),
      rungs,
      quotedN: quoted,
      counterfactual: isPlainObject(row.counterfactual) ? {
        itemsN: clampInt(row.counterfactual.itemsN, 0, 1e6, 0),
        riseN: clampInt(row.counterfactual.riseN, 0, 1e6, 0),
        fallN: clampInt(row.counterfactual.fallN, 0, 1e6, 0),
        unchangedN: clampInt(row.counterfactual.unchangedN, 0, 1e6, 0),
        aboveTopN: clampInt(row.counterfactual.aboveTopN, 0, 1e6, 0),
      } : null,
      totals: isPlainObject(row.totals) ? {
        itemsN: clampInt(row.totals.itemsN, 0, 1e7, 0),
        decidedN: clampInt(row.totals.decidedN, 0, 1e7, 0),
        falsifiedN: clampInt(row.totals.falsifiedN, 0, 10, 0),
      } : null,
      engine: clean(row.engine, 80) || null,
      gradedAt: day(row.gradedAt),
      grade: isPlainObject(row.grade) ? {
        gradedOn: day(row.grade.gradedOn),
        meanBrier: Number.isFinite(Number(row.grade.meanBrier)) ? Math.round(Number(row.grade.meanBrier) * 10000) / 10000 : null,
        rungsScoredN: clampInt(row.grade.rungsScoredN, 0, 10, 0),
        rows: (Array.isArray(row.grade.rows) ? row.grade.rows : []).filter(isPlainObject).map((gradeRow) => ({
          key: str(gradeRow.key),
          outcome: ['graded', 'pending', 'refused'].includes(gradeRow.outcome) ? gradeRow.outcome : 'refused',
          predictedPct: gradeRow.predictedPct === null || gradeRow.predictedPct === undefined ? null : Math.round(Number(gradeRow.predictedPct) * 10) / 10,
          observedPct: gradeRow.observedPct === null || gradeRow.observedPct === undefined ? null : Math.round(Number(gradeRow.observedPct) * 10) / 10,
          brier: gradeRow.brier === null || gradeRow.brier === undefined ? null : Math.round(Number(gradeRow.brier) * 10000) / 10000,
          n: clampInt(gradeRow.n, 0, 1e6, 0),
          reason: clean(gradeRow.reason, 300),
        })),
      } : null,
    });
  }
  out.sort((a, b) => String(b.frozenOn).localeCompare(String(a.frozenOn)));
  if (out.length > SPAN_LIMITS.readings) {
    warnings.push(`${out.length - SPAN_LIMITS.readings} older span-calibration reading(s) were dropped beyond the ${SPAN_LIMITS.readings}-reading cap.`);
    return out.slice(0, SPAN_LIMITS.readings);
  }
  return out;
}

/* ------------------------------------------------------------ adoptions */

export function normalizeSpanAdoptions(raw, warnings = []) {
  const rows = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isPlainObject(row) || !row.id || seen.has(row.id)) continue;
    const adoptedOn = day(row.adoptedOn);
    if (!adoptedOn) {
      warnings.push(`A ladder adoption (${row.id}) has no valid date and was dropped rather than back-filled: an undated declaration is not a declaration.`);
      continue;
    }
    const table = normalizeLadderTable(row.table);
    if (!table.length) {
      warnings.push(`A ladder adoption (${row.id}) carries no usable table and was dropped.`);
      continue;
    }
    seen.add(row.id);
    out.push({
      id: str(row.id),
      adoptedOn,
      readingId: row.readingId ? str(row.readingId) : null,
      action: row.action === 'restore' ? 'restore' : 'adopt',
      source: row.source === 'measured' ? 'measured' : 'declared',
      table,
      priorTable: normalizeLadderTable(row.priorTable),
      note: clean(row.note, 300),
      bySeatId: row.bySeatId ? str(row.bySeatId) : null,
      supersedesId: row.supersedesId ? str(row.supersedesId) : null,
    });
  }
  out.sort((a, b) => String(b.adoptedOn).localeCompare(String(a.adoptedOn)));
  return out;
}

/* -------------------------------------------------------------- markers */

export function normalizeSpanMarkers(raw) {
  const rows = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isPlainObject(row) || !row.id || seen.has(row.id)) continue;
    const week = str(row.week);
    if (!/^\d{4}-W\d{2}$/.test(week)) continue;
    seen.add(row.id);
    out.push({
      id: str(row.id),
      kind: clean(row.kind, 40),
      week,
      key: clean(row.key, 120),
      at: row.at ? str(row.at) : null,
    });
  }
  return out.slice(-SPAN_LIMITS.markers);
}

/** A reading may only be adopted if it quoted at least one rung verdict. */
export function adoptableReading(reading) {
  if (!isPlainObject(reading)) return { ok: false, error: 'No reading selected.' };
  const proposed = Array.isArray(reading.proposedLadder) ? reading.proposedLadder : [];
  if (!proposed.length) return { ok: false, error: 'This reading carries no proposed ladder to adopt.' };
  return { ok: true };
}

export { dayKey };
