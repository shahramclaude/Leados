/**
 * app/core/domain/finance.js — Budget envelopes & financial commitments.
 *
 * Until Schema v24, money existed in LeadOS only as scattered estimates: a
 * case's PERT exposure, a portfolio item's value triple, a negotiation's
 * stakes. None of it answered the first-time leader's most concrete finance
 * question — "what envelope do I have, what have I already committed against
 * it, what has actually been spent, and am I forecast to breach?" This module
 * is that ledger, built on commitment (encumbrance) accounting rather than a
 * single "spent" column:
 *
 *  1. Management accounting / budgetary control (Anthony & Govindarajan):
 *     an envelope is an approved ceiling for a period; control comes from
 *     comparing *forecast at completion* (actuals + open commitments) with
 *     the ceiling while there is still time to act — variance analysis
 *     after the period ends is archaeology, not control.
 *  2. Commitment / encumbrance accounting (public-sector budgetary control;
 *     GASB budgetary accounting, Oracle Commitment Model): a commitment
 *     reserves budget authority when the obligation is entered into, before
 *     any invoice exists. `planned` (an intention, not yet encumbered),
 *     `committed` (encumbered), `spent` (actual recorded, encumbrance
 *     reversed) and `released` (encumbrance cancelled, authority returned)
 *     are therefore four different states, never collapsed into one number.
 *  3. Honesty invariants, shared with the rest of LeadOS: amounts are only
 *     ever what the leader recorded. A missing actual is a visible gap, not
 *     zero and not the committed figure copied across. A budget has exactly
 *     one currency and lines inherit it, so totals can never mix currencies
 *     by construction — there is no FX Conversion anywhere in this module.
 *  4. Anti-gaming guardrail (Liebman & Mahoney, 2017, on expiring-budget
 *     "use it or lose it" surges; Hope & Fraser's Beyond Budgeting): an
 *     envelope is a ceiling, not a target. Underspend is never scored as
 *     failure and this module never recommends spending to protect a future
 *     envelope.
 *
 * Pure module: no DOM, no storage, no wall-clock reads beyond the `now`
 * argument every public function accepts.
 */

import { dayKey, daysBetween } from '../time.js';
import { linksForEntity } from './cases.js';

export const BUDGET_STATUSES = ['active', 'closed', 'archived'];
export const BUDGET_STATUS_LABELS = {
  active: 'Active',
  closed: 'Closed',
  archived: 'Archived',
};

export const BUDGET_LINE_STATUSES = ['planned', 'committed', 'spent', 'released'];
export const BUDGET_LINE_STATUS_LABELS = {
  planned: 'Planned (not yet committed)',
  committed: 'Committed (encumbered)',
  spent: 'Spent (actual recorded)',
  released: 'Released (authority returned)',
};
/** Statuses that still encumber or may encumber the envelope. */
export const OPEN_LINE_STATUSES = ['planned', 'committed'];

export const BUDGET_CATEGORIES = [
  'people',
  'tools-software',
  'vendors-services',
  'travel-events',
  'training-development',
  'facilities-equipment',
  'contingency',
  'other',
];
export const BUDGET_CATEGORY_LABELS = {
  people: 'People (contractors, overtime, backfill)',
  'tools-software': 'Tools & software',
  'vendors-services': 'Vendors & services',
  'travel-events': 'Travel & events',
  'training-development': 'Training & development',
  'facilities-equipment': 'Facilities & equipment',
  contingency: 'Contingency / risk reserve',
  other: 'Other',
};

/** Entity types a budget line may fund. Conflicts/pulses are excluded by design. */
export const BUDGET_SOURCE_TYPES = ['case', 'negotiation', 'portfolio', 'requisition', 'goal', 'decision', 'change'];
export const BUDGET_SOURCE_LABELS = {
  case: 'Operational case',
  negotiation: 'Negotiation',
  portfolio: 'Capacity / portfolio item',
  requisition: 'Hiring requisition',
  goal: 'Goal',
  decision: 'Decision',
  change: 'Org change',
};

/** Same evidence floor as every other calibration ledger (n=5, counts-only below). */
export const COMMITMENT_CALIBRATION_MIN_SAMPLES = 5;
/** Median actual/committed at or above this ratio is a *review* trigger, not a verdict. */
export const COMMITMENT_OVERRUN_MEDIAN_RATIO = 1.2;
/** Default share of envelope (forecast) at which a budget enters the watch zone. */
export const DEFAULT_BUDGET_WATCH_PCT = 80;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function amountOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : round2((sorted[mid - 1] + sorted[mid]) / 2 * 100) / 100;
}

export function formatMoney(currency, amount) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  const cur = String(currency || 'USD').toUpperCase();
  return `${cur} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function isBudgetOpen(budget) {
  return Boolean(budget && budget.status === 'active');
}

/**
 * Has the record a line funds reached a state where the money should have
 * landed? Used to prompt for actuals — never to invent them. Returns
 * `{ completed, label, on }`; unknown sources are simply not completed.
 */
export function sourceCompletion(state, sourceType, sourceId) {
  const none = { completed: false, label: '', on: null };
  if (!state || !sourceType || !sourceId) return none;
  switch (sourceType) {
    case 'case': {
      const rec = (state.cases || []).find((r) => r.id === sourceId);
      if (!rec) return none;
      const done = rec.status === 'resolved' || rec.status === 'closed';
      return { completed: done, label: done ? `Case ${rec.status}` : '', on: done ? rec.resolvedOn || null : null };
    }
    case 'negotiation': {
      const rec = (state.negotiations || []).find((r) => r.id === sourceId);
      if (!rec) return none;
      const settled = Boolean(rec.settlement?.settledOn);
      const done = rec.status === 'agreed';
      return {
        completed: done,
        label: settled ? 'Agreement settled' : done ? 'Agreement recorded' : '',
        on: rec.settlement?.settledOn || rec.closedOn || null,
      };
    }
    case 'portfolio': {
      const rec = (state.portfolio || []).find((r) => r.id === sourceId);
      if (!rec) return none;
      const done = rec.status === 'done';
      return { completed: done, label: done ? 'Work delivered' : '', on: rec.completedOn || null };
    }
    case 'requisition': {
      const rec = (state.requisitions || []).find((r) => r.id === sourceId);
      if (!rec) return none;
      const done = ['filled', 'cancelled', 'closed'].includes(rec.status);
      return { completed: done, label: done ? `Requisition ${rec.status}` : '', on: rec.closedOn || null };
    }
    case 'goal': {
      const rec = (state.goals || []).find((r) => r.id === sourceId);
      if (!rec) return none;
      const done = rec.status === 'done';
      return { completed: done, label: done ? 'Goal completed' : '', on: rec.completedOn || null };
    }
    case 'change': {
      const rec = (state.changes || []).find((r) => r.id === sourceId);
      if (!rec) return none;
      const done = rec.status === 'anchored';
      return { completed: done, label: done ? 'Change anchored' : '', on: rec.anchoredOn || null };
    }
    default:
      return none;
  }
}

/**
 * Evaluate one envelope. Every total is derived only from recorded amounts:
 *  - spentKnown: recorded actuals on `spent` lines (a spent line without an
 *    actual is listed in missingActualLines and contributes nothing — the
 *    forecast is then explicitly understated, and says so)
 *  - committedOpen: encumbered amounts on `committed` lines (unpriced
 *    commitments are counted in unpricedOpenCount, never valued at zero
 *    "for convenience" in prose)
 *  - forecastAtCompletion (FAC): spentKnown + committedOpen — what the
 *    envelope will consume if every open encumbrance lands at its recorded
 *    figure. Planned lines are NOT in FAC; they are pipelineExposure.
 */
export function evaluateBudget(budget, now = new Date(), { watchPct = DEFAULT_BUDGET_WATCH_PCT } = {}) {
  const today = dayKey(now);
  const lines = Array.isArray(budget?.lines) ? budget.lines : [];
  const watchRatio = Math.min(100, Math.max(50, Number(watchPct) || DEFAULT_BUDGET_WATCH_PCT)) / 100;

  let spentKnown = 0;
  let committedOpen = 0;
  let plannedPipeline = 0;
  let releasedTotal = 0;
  const missingActualLines = [];
  const overdueLines = [];
  const actualsDueLines = [];
  let unpricedOpenCount = 0;
  const byCategory = new Map();

  const addCategory = (category, facAmount) => {
    const key = BUDGET_CATEGORIES.includes(category) ? category : 'other';
    byCategory.set(key, round2((byCategory.get(key) || 0) + facAmount));
  };

  for (const line of lines) {
    const committed = amountOrNull(line.committedAmount);
    const actual = amountOrNull(line.actualAmount);
    if (line.status === 'spent') {
      if (actual === null) missingActualLines.push(line);
      else {
        spentKnown = round2(spentKnown + actual);
        addCategory(line.category, actual);
      }
    } else if (line.status === 'committed') {
      if (committed === null) unpricedOpenCount += 1;
      else {
        committedOpen = round2(committedOpen + committed);
        addCategory(line.category, committed);
      }
      if (line.expectedOn && line.expectedOn < today) overdueLines.push(line);
      if (line.actualsDueOn) actualsDueLines.push(line);
    } else if (line.status === 'planned') {
      if (committed === null) unpricedOpenCount += 1;
      else plannedPipeline = round2(plannedPipeline + committed);
    } else if (line.status === 'released') {
      if (committed !== null) releasedTotal = round2(releasedTotal + committed);
    }
  }

  const forecastAtCompletion = round2(spentKnown + committedOpen);
  const pipelineExposure = round2(forecastAtCompletion + plannedPipeline);
  const limit = amountOrNull(budget?.limit);
  const hasLimit = limit !== null && limit > 0;
  const remainingVsLimit = hasLimit ? round2(limit - forecastAtCompletion) : null;
  const forecastUtilisation = hasLimit ? round2((forecastAtCompletion / limit) * 1000) / 1000 : null;
  const pipelineUtilisation = hasLimit ? round2((pipelineExposure / limit) * 1000) / 1000 : null;
  const spentShare = hasLimit ? round2((spentKnown / limit) * 1000) / 1000 : null;
  const breach = hasLimit && forecastAtCompletion > limit;
  const pipelineBreach = hasLimit && !breach && pipelineExposure > limit;
  const watch = hasLimit && !breach && forecastUtilisation >= watchRatio;

  // Period position: informational only. Spend is lumpy (annual licences,
  // one-off events), so "ahead of elapsed time" is a prompt to look, never
  // a grade. Both dates must be recorded before any pace is computed.
  let periodElapsedPct = null;
  let daysToPeriodEnd = null;
  if (budget?.endsOn) daysToPeriodEnd = daysBetween(today, budget.endsOn);
  if (budget?.startsOn && budget?.endsOn && budget.endsOn > budget.startsOn) {
    const total = daysBetween(budget.startsOn, budget.endsOn);
    const elapsed = daysBetween(budget.startsOn, today);
    if (total !== null && total > 0 && elapsed !== null) {
      periodElapsedPct = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
    }
  }

  return {
    budgetId: budget?.id || null,
    currency: String(budget?.currency || 'USD').toUpperCase(),
    limit,
    hasLimit,
    lineCount: lines.length,
    spentKnown,
    committedOpen,
    plannedPipeline,
    releasedTotal,
    forecastAtCompletion,
    pipelineExposure,
    remainingVsLimit,
    forecastUtilisation,
    pipelineUtilisation,
    spentShare,
    watchRatio,
    breach,
    pipelineBreach,
    watch,
    missingActualLines,
    overdueLines,
    actualsDueLines,
    unpricedOpenCount,
    forecastUnderstated: missingActualLines.length > 0 || unpricedOpenCount > 0,
    byCategory: [...byCategory.entries()]
      .map(([category, amount]) => ({ category, label: BUDGET_CATEGORY_LABELS[category], amount }))
      .sort((a, b) => b.amount - a.amount),
    periodElapsedPct,
    daysToPeriodEnd,
    needsAttention: Boolean(
      budget?.status === 'active'
      && (breach || watch || pipelineBreach || actualsDueLines.length || overdueLines.length || missingActualLines.length),
    ),
  };
}

export function summarizeBudget(budget, state = null, now = new Date(), options = {}) {
  const evaluation = evaluateBudget(budget, now, options);
  const links = state ? linksForEntity(state, 'budget', budget.id) : [];
  return { record: budget, evaluation, links };
}

export function budgetsRollup(state, now = new Date()) {
  const watchPct = state?.settings?.budgetWatchPct ?? DEFAULT_BUDGET_WATCH_PCT;
  const all = (state?.budgets || []).map((b) => summarizeBudget(b, state, now, { watchPct }));
  const active = all.filter((s) => s.record.status === 'active');
  const attention = active.filter((s) => s.evaluation.needsAttention);
  const actualsDue = active.flatMap((s) => [
    ...s.evaluation.actualsDueLines.map((line) => ({ budget: s.record, line, reason: 'source-completed' })),
    ...s.evaluation.missingActualLines.map((line) => ({ budget: s.record, line, reason: 'spent-without-actual' })),
  ]);
  return {
    all,
    active,
    attention,
    breaches: active.filter((s) => s.evaluation.breach),
    watching: active.filter((s) => s.evaluation.watch || s.evaluation.pipelineBreach),
    actualsDue,
    byStatus: {
      active,
      closed: all.filter((s) => s.record.status === 'closed'),
      archived: all.filter((s) => s.record.status === 'archived'),
    },
  };
}

/**
 * Fifth calibration ledger: did commitments land at the figure they were
 * encumbered at? Pairs require a `spent` line with BOTH an explicit
 * committed amount (> 0) and an explicit recorded actual. The ratio is
 * dimensionless, so pooling ratios across currencies is arithmetically
 * honest in a way pooling amounts would not be — amounts themselves are
 * never summed across budgets/currencies here. Below n=5 the result is
 * counts-only (`sufficient: false`, no median), matching every other
 * ledger's small-sample discipline.
 */
export function commitmentCalibrationPairs(state) {
  const pairs = [];
  const missingItems = [];
  for (const budget of state?.budgets || []) {
    for (const line of budget.lines || []) {
      if (line.status !== 'spent') continue;
      const committed = amountOrNull(line.committedAmount);
      const actual = amountOrNull(line.actualAmount);
      if (actual === null) {
        missingItems.push({
          budgetId: budget.id,
          budgetName: budget.name,
          lineId: line.id,
          title: line.title,
          currency: budget.currency,
          reason: 'Marked spent without a recorded actual amount',
        });
        continue;
      }
      if (committed === null || committed <= 0) {
        missingItems.push({
          budgetId: budget.id,
          budgetName: budget.name,
          lineId: line.id,
          title: line.title,
          currency: budget.currency,
          reason: 'No positive committed amount was recorded to score the actual against',
        });
        continue;
      }
      pairs.push({
        budgetId: budget.id,
        budgetName: budget.name,
        lineId: line.id,
        title: line.title,
        category: line.category,
        currency: budget.currency,
        committedAmount: committed,
        actualAmount: actual,
        ratio: round2((actual / committed) * 100) / 100,
        spentOn: line.spentOn || null,
      });
    }
  }
  return { pairs, missingItems };
}

export function commitmentCalibration(state) {
  const { pairs, missingItems } = commitmentCalibrationPairs(state);
  const n = pairs.length;
  const sufficient = n >= COMMITMENT_CALIBRATION_MIN_SAMPLES;
  const ratios = pairs.map((p) => p.ratio).sort((a, b) => a - b);
  const medianRatio = sufficient ? median(ratios) : null;
  const p80Ratio = sufficient ? quantile(ratios, 0.8) : null;
  return {
    pairs,
    missingItems,
    n,
    sufficient,
    minSamples: COMMITMENT_CALIBRATION_MIN_SAMPLES,
    medianRatio,
    p80Ratio,
    materialOverrun: Boolean(sufficient && medianRatio !== null && medianRatio >= COMMITMENT_OVERRUN_MEDIAN_RATIO),
    overrunThreshold: COMMITMENT_OVERRUN_MEDIAN_RATIO,
  };
}

/**
 * A calibrated view of one envelope's forecast, shown NEXT TO the recorded
 * forecast — never instead of it. Applies the pooled median ratio to open
 * encumbrances only (spent actuals are facts). Null unless the reference
 * class is sufficient; the recorded committed amounts are never rewritten.
 */
export function calibratedForecast(budget, state, now = new Date()) {
  const cal = commitmentCalibration(state);
  if (!cal.sufficient || !cal.medianRatio) return null;
  const evaluation = evaluateBudget(budget, now, { watchPct: state?.settings?.budgetWatchPct });
  const adjusted = round2(evaluation.spentKnown + evaluation.committedOpen * cal.medianRatio);
  return {
    medianRatio: cal.medianRatio,
    p80Ratio: cal.p80Ratio,
    n: cal.n,
    recordedForecast: evaluation.forecastAtCompletion,
    calibratedForecast: adjusted,
    calibratedBreach: Boolean(evaluation.hasLimit && adjusted > evaluation.limit && !evaluation.breach),
  };
}
