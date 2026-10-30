/**
 * app/core/domain/compSchema.js — the stored contract for Schema v51.
 *
 * `comp.js` is the analysis; this module decides what a half-written, hand-edited
 * or older merit cycle is allowed to become on load. The rules follow every other
 * ledger in this app:
 *
 *  - a pay figure that is not a real number is `null`, never zero, because a
 *    zero salary would silently become a 100% proposed increase;
 *  - a band whose floor is above its ceiling is dropped with a warning rather
 *    than repaired into invented money;
 *  - a dangling person reference is kept as a labelled row so the frozen audit
 *    and the history remain readable, but it cannot receive an adjustment;
 *  - a frozen audit is preserved exactly. Re-deriving a finalized cycle from
 *    today's records would rewrite the record of what the leader actually
 *    decided, which is the only thing the audit is for.
 */

import { dayKey } from '../time.js';
import { COMP_DIMENSIONS, COMP_ORIGINS, COMP_STATUSES } from './comp.js';

export const COMP_SNAPSHOT_VERSION = 1;
export const COMP_MAX_ROWS = 400;
export const COMP_MAX_NOTE = 400;
export const COMP_MAX_PAY = 100000000;
export const COMP_MAX_BUDGET = 100000000;
export const COMP_HISTORY_CAP = 40;

const LEVELS = ['ic', 'senior', 'lead', 'manager', 'director', 'vp'];

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function clean(text, max) {
  return str(text).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function day(value) {
  const raw = str(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function isoOrNull(value) {
  const raw = str(value).trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function moneyOrNull(value, max = COMP_MAX_PAY) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(max, Math.round(n * 100) / 100);
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Compensation bands: one per level and effective date. */
export function normalizeCompBands(raw, now, warnings = []) {
  const rows = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const band of rows) {
    if (!isPlainObject(band)) continue;
    const level = str(band.level).trim();
    if (!LEVELS.includes(level)) {
      warnings.push(`Compensation bands: dropped a band with an unrecognised level “${level.slice(0, 20)}”`);
      continue;
    }
    const min = moneyOrNull(band.min);
    const mid = moneyOrNull(band.mid);
    const max = moneyOrNull(band.max);
    if (min === null || mid === null || max === null || !(min < max) || mid < min || mid > max) {
      warnings.push(`Compensation bands: dropped the ${level} band because its floor, midpoint and ceiling do not form a range`);
      continue;
    }
    const effectiveOn = day(band.effectiveOn) || dayKey(now);
    const id = str(band.id).trim() || `band-${level}-${effectiveOn}`;
    const key = `${level}:${effectiveOn}`;
    if (seen.has(key)) {
      warnings.push(`Compensation bands: dropped a duplicate ${level} band dated ${effectiveOn}`);
      continue;
    }
    seen.add(key);
    out.push({
      id,
      level,
      label: clean(band.label, 60) || level,
      min,
      mid,
      max,
      effectiveOn,
      notes: clean(band.notes, 400),
      createdAt: isoOrNull(band.createdAt) || now,
      updatedAt: isoOrNull(band.updatedAt) || now,
    });
  }
  return out.slice(0, 200);
}

/* ------------------------------------------------------------- frozen audit */

/**
 * A finalized reading. Every field is validated for range and preserved, never
 * recomputed. An audit that cannot be read is dropped so the cycle can be
 * reopened deliberately rather than silently losing its status.
 */
export function normalizeFairnessSnapshot(raw) {
  if (!isPlainObject(raw)) return null;
  const status = ['observed', 'insufficient'].includes(raw.status) ? raw.status : 'observed';
  const integrity = isPlainObject(raw.integrity) ? raw.integrity : {};
  const decomposition = isPlainObject(raw.decomposition) ? raw.decomposition : null;
  const impact = isPlainObject(raw.impact) ? raw.impact : null;
  const flagRows = (Array.isArray(raw.flags) ? raw.flags : []).filter(isPlainObject);
  return {
    version: COMP_SNAPSHOT_VERSION,
    on: day(raw.on) || null,
    at: isoOrNull(raw.at) || null,
    byId: str(raw.byId).trim() || null,
    status,
    budget: {
      kind: raw.budget?.kind === 'pool-pct' ? 'pool-pct' : 'amount',
      amount: moneyOrNull(raw.budget?.amount, COMP_MAX_BUDGET) ?? 0,
      payroll: moneyOrNull(raw.budget?.payroll) ?? 0,
      pctOfPayroll: Number.isFinite(Number(raw.budget?.pctOfPayroll))
        ? Math.round(Number(raw.budget.pctOfPayroll) * 10) / 10
        : null,
    },
    spent: moneyOrNull(raw.spent, COMP_MAX_BUDGET) ?? 0,
    rowCount: clampInt(raw.rowCount, 0, COMP_MAX_ROWS, 0),
    integrity: {
      rows: clampInt(integrity.rows, 0, COMP_MAX_ROWS, 0),
      withPay: clampInt(integrity.withPay, 0, COMP_MAX_ROWS, 0),
      withoutPay: clampInt(integrity.withoutPay, 0, COMP_MAX_ROWS, 0),
      noBand: clampInt(integrity.noBand, 0, COMP_MAX_ROWS, 0),
      belowFloor: clampInt(integrity.belowFloor, 0, COMP_MAX_ROWS, 0),
      aboveCeiling: clampInt(integrity.aboveCeiling, 0, COMP_MAX_ROWS, 0),
      insideBand: clampInt(integrity.insideBand, 0, COMP_MAX_ROWS, 0),
    },
    decomposition: decomposition && {
      status: decomposition.status === 'ok' ? 'ok' : 'insufficient',
      dimension: str(decomposition.dimension, ''),
      groupA: clean(decomposition.groupA, 80),
      groupB: clean(decomposition.groupB, 80),
      n: clampInt(decomposition.n, 0, COMP_MAX_ROWS, 0),
      gapPct: Number.isFinite(Number(decomposition.gapPct)) ? Number(decomposition.gapPct) : null,
      explainedPct: Number.isFinite(Number(decomposition.explainedPct)) ? Number(decomposition.explainedPct) : null,
      unexplainedPct: Number.isFinite(Number(decomposition.unexplainedPct)) ? Number(decomposition.unexplainedPct) : null,
      intervalPct: Array.isArray(decomposition.intervalPct) && decomposition.intervalPct.length === 2
        ? decomposition.intervalPct.map((value) => (Number.isFinite(Number(value)) ? Number(value) : null))
        : null,
      floorPct: Number.isFinite(Number(decomposition.floorPct)) ? Number(decomposition.floorPct) : null,
      ridge: decomposition.ridge === true,
      controls: (Array.isArray(decomposition.controls) ? decomposition.controls : []).map((row) => clean(row, 40)).slice(0, 12),
    },
    impact: impact && {
      status: impact.status === 'ok' ? 'ok' : 'insufficient',
      ratio: Number.isFinite(Number(impact.ratio)) ? Math.round(Number(impact.ratio) * 1000) / 1000 : null,
      threshold: Number.isFinite(Number(impact.threshold)) ? Number(impact.threshold) : null,
      flagged: impact.flagged === true,
      reliable: impact.reliable === true,
      cut: Number.isFinite(Number(impact.cut)) ? Number(impact.cut) : null,
      groups: (Array.isArray(impact.groups) ? impact.groups : []).filter(isPlainObject).map((group) => ({
        label: clean(group.label, 80),
        n: clampInt(group.n, 0, COMP_MAX_ROWS, 0),
        favourable: clampInt(group.favourable, 0, COMP_MAX_ROWS, 0),
        meanAdjustPct: Number.isFinite(Number(group.meanAdjustPct)) ? Number(group.meanAdjustPct) : null,
      })).slice(0, 8),
    },
    compression: {
      inversion: clampInt(raw.compression?.inversion, 0, COMP_MAX_ROWS, 0),
      loyaltyPenalty: clampInt(raw.compression?.loyaltyPenalty, 0, COMP_MAX_ROWS, 0),
    },
    // Predictions are the only person-level content in the snapshot, and they
    // exist so the model can be scored later. They are numbers and IDs only.
    predictions: (Array.isArray(raw.predictions) ? raw.predictions : [])
      .filter(isPlainObject)
      .filter((row) => str(row.personId).trim())
      .slice(0, COMP_MAX_ROWS)
      .map((row) => ({
        personId: str(row.personId).trim(),
        departurePct: Number.isFinite(Number(row.departurePct)) ? Math.round(Number(row.departurePct) * 10) / 10 : null,
        replacementCost: moneyOrNull(row.replacementCost) ?? null,
        adjustPct: Number.isFinite(Number(row.adjustPct)) ? Number(row.adjustPct) : null,
        level: str(row.level, '').slice(0, 20),
      })),
    expectedDepartures: Number.isFinite(Number(raw.expectedDepartures)) ? Number(raw.expectedDepartures) : null,
    replacementExposure: moneyOrNull(raw.replacementExposure) ?? null,
    flags: flagRows.slice(0, 12).map((flag) => ({
      id: str(flag.id, '').slice(0, 40),
      severity: clampInt(flag.severity, 1, 5, 2),
      detail: clean(flag.detail, 300),
    })),
    policies: (Array.isArray(raw.policies) ? raw.policies : []).filter(isPlainObject).slice(0, 4).map((policy) => ({
      id: str(policy.id, '').slice(0, 20),
      spend: moneyOrNull(policy.spend) ?? 0,
      expectedDepartures: Number.isFinite(Number(policy.expectedDepartures)) ? Number(policy.expectedDepartures) : null,
      retainedValue: moneyOrNull(policy.retainedValue) ?? null,
      regretValue: moneyOrNull(policy.regretValue) ?? null,
    })),
  };
}

/** Build the frozen snapshot from a live reading. Called once, inside finalize. */
export function buildFairnessSnapshot(reading, { capturedAt, byId = null } = {}) {
  const decomposition = reading.decomposition || {};
  const impact = reading.impact || {};
  const usable = reading.integrity?.counts?.withPay ?? 0;
  return normalizeFairnessSnapshot({
    on: reading.generatedFor,
    at: capturedAt,
    byId,
    // A cycle with no pay or bands is not "graded zero": it is recorded as an
    // audit that could not see, so the frozen record never implies a pass.
    status: usable > 0 ? 'observed' : 'insufficient',
    budget: {
      kind: reading.budget?.kind,
      amount: reading.budget?.amount,
      payroll: reading.budget?.payroll,
      pctOfPayroll: reading.budget?.pctOfPayroll,
    },
    spent: reading.spent,
    rowCount: reading.rows?.length ?? 0,
    integrity: reading.integrity?.counts || {},
    decomposition: decomposition.status === 'ok'
      ? {
        status: 'ok',
        dimension: decomposition.dimension,
        groupA: decomposition.groupA,
        groupB: decomposition.groupB,
        n: decomposition.n,
        gapPct: decomposition.gapPct,
        explainedPct: decomposition.explainedPct,
        unexplainedPct: decomposition.unexplainedPct,
        intervalPct: decomposition.interval?.unexplainedPct || null,
        floorPct: decomposition.floorPct,
        ridge: decomposition.ridge,
        controls: decomposition.controls,
      }
      : { status: 'insufficient', dimension: decomposition.dimension, n: decomposition.n ?? 0 },
    impact: {
      status: impact.status,
      ratio: impact.ratio ?? null,
      threshold: impact.threshold ?? null,
      flagged: impact.flagged === true,
      reliable: impact.reliable === true,
      cut: impact.cut ?? null,
      groups: impact.groups || [],
    },
    compression: {
      inversion: (reading.compression || []).filter((finding) => finding.kind === 'inversion').length,
      loyaltyPenalty: (reading.compression || []).filter((finding) => finding.kind === 'loyalty-penalty').length,
    },
    predictions: (reading.exposures || []).map((row) => ({
      personId: row.personId,
      departurePct: row.departurePct,
      replacementCost: row.replacementCost,
      adjustPct: row.allocatedPct,
      level: reading.rows?.find((candidate) => candidate.personId === row.personId)?.level || '',
    })),
    expectedDepartures: reading.expectedDepartures,
    replacementExposure: reading.replacementExposure,
    flags: reading.flags || [],
    policies: (reading.policies?.policies || []).map((policy) => ({
      id: policy.id,
      spend: policy.spend,
      expectedDepartures: policy.expectedDepartures,
      retainedValue: policy.retainedValue,
      regretValue: policy.regretValue,
    })),
  });
}

/* ------------------------------------------------------------- merit cycles */

function normalizeRows(raw, state, now, warnings) {
  const people = new Set((state?.people || []).map((person) => person?.id).filter(Boolean));
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(raw) ? raw : []) {
    if (!isPlainObject(row)) continue;
    const personId = str(row.personId).trim();
    if (!personId || seen.has(personId)) continue;
    seen.add(personId);
    const level = LEVELS.includes(str(row.level)) ? str(row.level) : null;
    const currentPay = moneyOrNull(row.currentPay);
    const proposedPay = moneyOrNull(row.proposedPay);
    // A dangling person is retained as a labelled row rather than deleted: the
    // money that was committed to them still happened, and a frozen audit that
    // silently changes its denominator is not an audit.
    if (!people.has(personId)) {
      warnings.push('Merit cycle: a pay row refers to a person who is no longer in the roster');
    }
    out.push({
      personId,
      level,
      currentPay,
      proposedPay,
      origin: COMP_ORIGINS.includes(str(row.origin)) ? str(row.origin) : 'unknown',
      retentionConcern: row.retentionConcern === true,
      note: clean(row.note, COMP_MAX_NOTE),
      updatedAt: isoOrNull(row.updatedAt) || now,
    });
    if (out.length >= COMP_MAX_ROWS) break;
  }
  return out;
}

function normalizeOutcomes(raw, now) {
  return (Array.isArray(raw) ? raw : [])
    .filter(isPlainObject)
    .filter((row) => str(row.personId).trim())
    .slice(0, COMP_MAX_ROWS)
    .map((row) => ({
      personId: str(row.personId).trim(),
      on: day(row.on) || dayKey(now),
      // `null` is a real state: the horizon has not resolved, so the prediction
      // is not yet scoreable and must not be counted as a retention success.
      departed: row.departed === true ? true : row.departed === false ? false : null,
      horizonOn: day(row.horizonOn) || null,
    }));
}

export function normalizeMeritCycles(raw, state, now, warnings = []) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const cycle of list) {
    if (!isPlainObject(cycle)) continue;
    const id = str(cycle.id).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const status = COMP_STATUSES.includes(str(cycle.status)) ? str(cycle.status) : 'draft';
    const audit = normalizeFairnessSnapshot(cycle.audit);
    // A cycle that claims to be finalized without a readable audit is reopened
    // deliberately: a frozen record that cannot be read is not a frozen record.
    const effectiveStatus = status === 'finalized' && !audit ? 'draft' : status;
    if (status === 'finalized' && !audit) {
      warnings.push(`Merit cycle “${str(cycle.label).slice(0, 40)}” claimed to be finalized without a readable audit and was reopened`);
    }
    const budgetKind = cycle.budget?.kind === 'pool-pct' ? 'pool-pct' : 'amount';
    const budgetValue = moneyOrNull(cycle.budget?.value, budgetKind === 'pool-pct' ? 100 : COMP_MAX_BUDGET);
    out.push({
      id,
      label: clean(cycle.label, 120) || 'Merit cycle',
      currency: str(cycle.currency, 'USD').toUpperCase().slice(0, 3) || 'USD',
      effectiveOn: day(cycle.effectiveOn) || dayKey(now),
      status: effectiveStatus,
      budget: {
        kind: budgetKind,
        value: budgetValue ?? 0,
      },
      comparison: {
        dimension: COMP_DIMENSIONS.includes(str(cycle.comparison?.dimension))
          ? str(cycle.comparison.dimension)
          : 'origin',
      },
      ownerId: str(cycle.ownerId).trim() || null,
      rows: normalizeRows(cycle.rows, state, now, warnings),
      audit,
      outcomes: normalizeOutcomes(cycle.outcomes, now),
      history: (Array.isArray(cycle.history) ? cycle.history : [])
        .filter((row) => isPlainObject(row) && typeof row.summary === 'string')
        .slice(-COMP_HISTORY_CAP)
        .map((row) => ({
          at: isoOrNull(row.at) || now,
          type: str(row.type, 'updated').slice(0, 40),
          summary: str(row.summary).slice(0, 300),
        })),
      createdAt: isoOrNull(cycle.createdAt) || now,
      updatedAt: isoOrNull(cycle.updatedAt) || now,
    });
    if (out.length >= 60) break;
  }
  return out;
}
