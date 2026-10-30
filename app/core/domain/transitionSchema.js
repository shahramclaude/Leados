/**
 * app/core/domain/transitionSchema.js — the stored contract for Schema v52.
 *
 * `transition.js` is the analysis; this module decides what a half-written,
 * hand-edited or older transition programme is allowed to become on load. The
 * rules follow every other ledger in this app:
 *
 *  - a candidate row keeps its person reference even when the person has been
 *    removed, because the frozen snapshot and the history must stay readable —
 *    but a row without a person is never selectable;
 *  - a missing pay figure is `null`, never zero, and an exit cost is never
 *    derived here: it is derived at read time from recorded pay and the declared
 *    conventions, so a stored number can never drift from the record;
 *  - a frozen snapshot is preserved exactly. Re-deriving a finalized programme
 *    from today's roster would rewrite the record of what the leader actually
 *    decided, which is the only thing the snapshot is for;
 *  - a gate is a recorded human check. There is no inference from the presence
 *    of a decision, because that inference is exactly the paperwork/delivery
 *    confusion this module exists to prevent.
 */

import { dayKey } from '../time.js';
import {
  TRANSITION_CONVENTIONS,
  TRANSITION_CRITERIA,
  TRANSITION_DIMENSIONS,
  TRANSITION_GATES,
  TRANSITION_GATE_STATUSES,
  TRANSITION_KINDS,
  TRANSITION_STATUSES,
} from './transition.js';

export const TRANSITION_SNAPSHOT_VERSION = 1;
export const TRANSITION_MAX_ROWS = 300;
export const TRANSITION_MAX_NOTE = 400;
export const TRANSITION_MAX_LABEL = 140;
export const TRANSITION_MAX_AMOUNT = 1000000000;
export const TRANSITION_HISTORY_CAP = 40;

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
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function nonNegativeOrNull(value, max = TRANSITION_MAX_AMOUNT) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(max, Math.round(n * 100) / 100);
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeWeights(raw, warnings) {
  const source = isPlainObject(raw) ? raw : {};
  const out = {};
  let any = false;
  for (const criterion of TRANSITION_CRITERIA) {
    const value = Number(source[criterion.key]);
    if (Number.isFinite(value) && value > 0) {
      out[criterion.key] = Math.min(100, Math.round(value * 10) / 10);
      any = true;
    } else {
      out[criterion.key] = 0;
    }
  }
  if (!any) {
    // No usable weight is a declaration of "no criteria", which cannot be a
    // selection: fall back to the printed defaults rather than to zeroes that
    // would make every candidate score 0.
    if (Object.keys(source).length) warnings.push('Transition: a programme had no usable criteria weight, so the printed default weighting was restored.');
    for (const criterion of TRANSITION_CRITERIA) out[criterion.key] = criterion.weight;
  }
  return out;
}

function normalizeRows(raw, state, programId, warnings) {
  const rows = Array.isArray(raw) ? raw : [];
  const personIds = new Set((state?.people || []).map((person) => person.id));
  const seen = new Set();
  const out = [];
  let dangling = 0;
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const personId = str(row.personId).trim();
    if (!personId) {
      warnings.push(`Transition: dropped a candidate row on “${programId}” with no person reference`);
      continue;
    }
    if (seen.has(personId)) {
      warnings.push(`Transition: dropped a duplicate candidate row for the same person on “${programId}”`);
      continue;
    }
    seen.add(personId);
    if (!personIds.has(personId)) dangling += 1;
    out.push({
      personId,
      selected: row.selected === true,
      locked: row.locked === true,
      group: clean(row.group, 8).toUpperCase(),
      mobility: row.mobility === null || row.mobility === undefined || row.mobility === ''
        ? null
        : clampInt(row.mobility, 0, 100, 50),
      workloadUnits: row.workloadUnits === null || row.workloadUnits === undefined || row.workloadUnits === ''
        ? null
        : clampNumber(row.workloadUnits, 0, 1000, 0),
      note: clean(row.note, TRANSITION_MAX_NOTE),
    });
    if (out.length >= TRANSITION_MAX_ROWS) break;
  }
  if (dangling) {
    warnings.push(`Transition: ${dangling} candidate row(s) on “${programId}” reference a person no longer in the roster. They stay readable and cannot be selected.`);
  }
  return out;
}

function normalizeGates(raw, warnings) {
  const rows = Array.isArray(raw) ? raw : [];
  const byKey = new Map();
  const keys = new Set(TRANSITION_GATES.map((gate) => gate.key));
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const key = str(row.key).trim();
    if (!keys.has(key)) {
      warnings.push(`Transition: dropped an unrecognised process gate “${key.slice(0, 20)}”`);
      continue;
    }
    if (byKey.has(key)) continue;
    const status = TRANSITION_GATE_STATUSES.includes(row.status) ? row.status : null;
    byKey.set(key, {
      key,
      done: status ? status === 'done' : row.done === true,
      blocked: status ? status === 'blocked' : row.blocked === true,
      on: day(row.on),
      recordedAt: isoOrNull(row.recordedAt),
      note: clean(row.note, TRANSITION_MAX_NOTE),
    });
  }
  return [...byKey.values()];
}

/* ------------------------------------------------------------- the snapshot */

function normalizeScreen(raw) {
  if (!isPlainObject(raw)) return null;
  const status = raw.status === 'ok' ? 'ok' : 'insufficient';
  return {
    status,
    dimension: TRANSITION_DIMENSIONS.includes(raw.dimension) ? raw.dimension : 'team',
    target: raw.target === 'recommended' ? 'recommended' : 'proposed',
    ratio: Number.isFinite(Number(raw.ratio)) ? Math.round(Number(raw.ratio) * 1000) / 1000 : null,
    threshold: Number.isFinite(Number(raw.threshold)) ? Number(raw.threshold) : TRANSITION_CONVENTIONS.impactRatio,
    flagged: raw.flagged === true,
    reliable: raw.reliable === true,
    groups: (Array.isArray(raw.groups) ? raw.groups : []).filter(isPlainObject).slice(0, 12).map((group) => ({
      label: clean(group.label, 60),
      n: clampInt(group.n, 0, TRANSITION_MAX_ROWS, 0),
      selected: clampInt(group.selected, 0, TRANSITION_MAX_ROWS, 0),
      rate: Number.isFinite(Number(group.rate)) ? Math.round(Number(group.rate) * 1000) / 1000 : null,
      low: Number.isFinite(Number(group.low)) ? Math.round(Number(group.low) * 1000) / 1000 : null,
      high: Number.isFinite(Number(group.high)) ? Math.round(Number(group.high) * 1000) / 1000 : null,
    })),
  };
}

/**
 * Freeze validation. Every field is range-checked and preserved; nothing is
 * recomputed from the current roster. A prediction is the only per-person
 * content in the snapshot, and it exists so the convention can be scored later.
 */
export function normalizeTransitionSnapshot(raw) {
  if (!isPlainObject(raw)) return null;
  return {
    version: TRANSITION_SNAPSHOT_VERSION,
    on: day(raw.on),
    at: isoOrNull(raw.at),
    byId: str(raw.byId).trim() || null,
    currency: /^[A-Z]{3}$/.test(str(raw.currency)) ? str(raw.currency) : 'USD',
    target: {
      headcount: clampInt(raw.target?.headcount, 0, TRANSITION_MAX_ROWS, 0),
      costCeiling: nonNegativeOrNull(raw.target?.costCeiling),
    },
    achieved: {
      named: clampInt(raw.achieved?.named, 0, TRANSITION_MAX_ROWS, 0),
      cashCost: nonNegativeOrNull(raw.achieved?.cashCost) ?? 0,
      unpriced: clampInt(raw.achieved?.unpriced, 0, TRANSITION_MAX_ROWS, 0),
      replacementExposure: nonNegativeOrNull(raw.achieved?.replacementExposure) ?? 0,
      capabilityLostPct: Number.isFinite(Number(raw.achieved?.capabilityLostPct)) ? Number(raw.achieved.capabilityLostPct) : null,
      highPerformersLost: clampInt(raw.achieved?.highPerformersLost, 0, TRANSITION_MAX_ROWS, 0),
    },
    screen: normalizeScreen(raw.screen),
    stability: {
      draws: clampInt(raw.stability?.draws, 0, 2000, 0),
      core: clampInt(raw.stability?.core, 0, TRANSITION_MAX_ROWS, 0),
      knifeEdge: clampInt(raw.stability?.knifeEdge, 0, TRANSITION_MAX_ROWS, 0),
      stableRetained: clampInt(raw.stability?.stableRetained, 0, TRANSITION_MAX_ROWS, 0),
    },
    compliance: {
      status: raw.compliance?.status === 'ok' ? 'ok' : 'not-computed',
      feasible: raw.compliance?.feasible === true ? true : raw.compliance?.feasible === false ? false : null,
      swaps: clampInt(raw.compliance?.swaps, 0, 200, 0),
      costDelta: nonNegativeOrNull(raw.compliance?.costDelta) ?? 0,
    },
    continuity: {
      atRisk: clampInt(raw.continuity?.atRisk, 0, TRANSITION_MAX_ROWS, 0),
      blockers: clampInt(raw.continuity?.blockers, 0, TRANSITION_MAX_ROWS, 0),
      totalRisk: clampInt(raw.continuity?.totalRisk, 0, 100000, 0),
    },
    survivors: {
      flagged: clampInt(raw.survivors?.flagged, 0, TRANSITION_MAX_ROWS, 0),
      beforeMedian: Number.isFinite(Number(raw.survivors?.beforeMedian)) ? Number(raw.survivors.beforeMedian) : null,
      afterMedian: Number.isFinite(Number(raw.survivors?.afterMedian)) ? Number(raw.survivors.afterMedian) : null,
      expectedDepartures: Number.isFinite(Number(raw.survivors?.expectedDepartures)) ? Number(raw.survivors.expectedDepartures) : null,
    },
    options: {
      recommended: str(raw.options?.recommended, '') || null,
    },
    predictions: (Array.isArray(raw.predictions) ? raw.predictions : [])
      .filter(isPlainObject)
      .filter((row) => str(row.personId).trim())
      .slice(0, TRANSITION_MAX_ROWS)
      .map((row) => ({
        personId: str(row.personId).trim(),
        selected: row.selected === true,
        selectionPct: Number.isFinite(Number(row.selectionPct)) ? Math.round(Number(row.selectionPct)) : null,
        departurePct: Number.isFinite(Number(row.departurePct)) ? Math.round(Number(row.departurePct) * 10) / 10 : null,
        riskScore: Number.isFinite(Number(row.riskScore)) ? Math.round(Number(row.riskScore)) : null,
      })),
  };
}

/**
 * Build the frozen reading at finalization.
 *
 * Everything a later review will need to score is captured here and nothing is
 * recomputed afterwards: cost, the screen as it stood, the weight-robustness
 * counts, the blocker and hand-over counts, the survivor medians, and — the only
 * per-person content — the frozen selection and departure predictions. Person
 * IDs are data; names, notes and free text are never copied in, so a redacted
 * export that omits people cannot leak them through this object.
 */
export function buildTransitionSnapshot(reading, { capturedAt, byId = null, currency = 'USD' } = {}) {
  const plan = reading.plan;
  const screen = reading.screen;
  const robustness = reading.robustness;
  return normalizeTransitionSnapshot({
    on: reading.program?.effectiveOn || null,
    at: capturedAt || null,
    byId,
    currency,
    target: { headcount: plan.target, costCeiling: plan.costCeiling },
    achieved: {
      named: plan.proposed.length,
      cashCost: plan.cost,
      unpriced: plan.unpriced,
      replacementExposure: plan.replacementExposure,
      capabilityLostPct: plan.capabilityLostPct,
      highPerformersLost: plan.highPerformersLost,
    },
    screen: screen.status === 'ok'
      ? {
        status: 'ok',
        dimension: screen.dimension,
        target: screen.target,
        ratio: screen.ratio,
        threshold: screen.threshold,
        flagged: screen.flagged,
        reliable: screen.reliable,
        groups: screen.groups,
      }
      : { status: 'insufficient', dimension: screen.dimension, ratio: null, threshold: screen.threshold },
    stability: {
      draws: robustness.status === 'ok' ? robustness.draws : 0,
      core: robustness.core?.length || 0,
      knifeEdge: robustness.knifeEdge?.length || 0,
      stableRetained: robustness.stableRetained?.length || 0,
    },
    compliance: {
      status: reading.compliance?.status === 'ok' ? 'ok' : 'not-computed',
      feasible: reading.compliance?.feasible ?? null,
      swaps: reading.compliance?.swaps?.length || 0,
      costDelta: reading.compliance?.costDelta || 0,
    },
    continuity: {
      atRisk: reading.continuity.atRisk.length,
      blockers: reading.continuity.blockers.length,
      totalRisk: reading.continuity.totalRisk,
    },
    survivors: {
      flagged: reading.survivors.flagged.length,
      beforeMedian: reading.survivors.beforeMedian,
      afterMedian: reading.survivors.afterMedian,
      expectedDepartures: reading.survivors.expectedDepartures,
    },
    options: { recommended: reading.options?.recommended || null },
    predictions: [
      ...plan.proposed.map((row) => ({
        personId: row.personId,
        selected: true,
        selectionPct: robustness.byPerson?.get?.(row.personId)?.pct ?? null,
        departurePct: null,
        riskScore: reading.continuity.rows.find((entry) => entry.personId === row.personId)?.riskScore ?? null,
      })),
      // Retained people are frozen too. A calibration that only records the
      // people who were selected can never see a false positive.
      ...reading.survivors.predictions
        .filter((prediction) => !plan.proposedIds.has(prediction.personId))
        .map((prediction) => ({
          personId: prediction.personId,
          selected: false,
          selectionPct: robustness.byPerson?.get?.(prediction.personId)?.pct ?? null,
          departurePct: prediction.departurePct,
          riskScore: null,
        })),
    ],
  });
}

/* ------------------------------------------------------------- programmes */

export function normalizeTransitionPrograms(raw, state, now, warnings = []) {
  const rows = Array.isArray(raw) ? raw : [];
  const programIds = new Set();
  const out = [];
  for (const item of rows) {
    if (!isPlainObject(item)) continue;
    const label = clean(item.label, TRANSITION_MAX_LABEL);
    if (!label) {
      warnings.push('Transition: dropped a programme with no name — an unnamed reduction cannot be reviewed');
      continue;
    }
    const id = str(item.id).trim() || `transition-${out.length + 1}`;
    if (programIds.has(id)) {
      warnings.push('Transition: dropped a duplicate programme record');
      continue;
    }
    programIds.add(id);
    const effectiveOn = day(item.effectiveOn) || dayKey(now);
    const status = TRANSITION_STATUSES.includes(item.status) ? item.status : 'draft';
    const snapshot = normalizeTransitionSnapshot(item.snapshot);
    if (item.snapshot && !snapshot) warnings.push(`Transition: “${label}” had an unreadable frozen snapshot; it was dropped so the programme can be finalized again deliberately`);
    const personIds = new Set((state?.people || []).map((person) => person.id));
    out.push({
      id,
      label,
      currency: /^[A-Z]{3}$/.test(str(item.currency)) ? str(item.currency) : 'USD',
      kind: TRANSITION_KINDS.includes(item.kind) ? item.kind : 'reduction',
      status,
      declaredOn: day(item.declaredOn) || dayKey(now),
      effectiveOn,
      dimension: TRANSITION_DIMENSIONS.includes(item.dimension) ? item.dimension : 'team',
      target: {
        headcount: clampInt(item.target?.headcount, 0, TRANSITION_MAX_ROWS, 0),
        costCeiling: nonNegativeOrNull(item.target?.costCeiling),
      },
      weights: normalizeWeights(item.weights, warnings),
      rows: normalizeRows(item.rows, state, label, warnings),
      gates: normalizeGates(item.gates, warnings),
      snapshot,
      outcomes: (Array.isArray(item.outcomes) ? item.outcomes : [])
        .filter(isPlainObject)
        .filter((outcome) => str(outcome.personId).trim() && typeof outcome.departed === 'boolean')
        .slice(0, TRANSITION_MAX_ROWS)
        .map((outcome) => ({
          personId: str(outcome.personId).trim(),
          on: day(outcome.on) || dayKey(now),
          departed: outcome.departed === true,
          selected: outcome.selected === true,
          departurePct: Number.isFinite(Number(outcome.departurePct)) ? Math.round(Number(outcome.departurePct) * 10) / 10 : null,
          horizonOn: day(outcome.horizonOn),
        })),
      notes: clean(item.notes, 1000),
      createdAt: isoOrNull(item.createdAt) || now,
      updatedAt: isoOrNull(item.updatedAt) || now,
      history: (Array.isArray(item.history) ? item.history : [])
        .filter(isPlainObject)
        .slice(-TRANSITION_HISTORY_CAP)
        .map((entry) => ({
          at: isoOrNull(entry.at) || now,
          type: str(entry.type, 'note').slice(0, 40),
          summary: clean(entry.summary, 400),
        })),
    });
    // A row whose person has been archived is kept (history) but cannot be
    // selected: the engine reads `stillActive` from the roster, not from here.
    void personIds;
  }
  return out;
}
