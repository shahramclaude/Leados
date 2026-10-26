/**
 * app/core/domain/forecastIntegrity.js — Cross-ledger Forecast Integrity,
 * conformal outside-view bands and event-driven challenge propagation.
 *
 * Why this module exists
 * ----------------------
 * LeadOS already kept FIVE independent forecast-calibration ledgers (decision
 * probabilities, plan effort, case exposure/capacity/spend, negotiated value
 * and budget commitments). Each one was honest in isolation, but none of them
 * answered the leader's actual question before a new commitment: "given every
 * promise this team has made and settled, what range of outcomes should I
 * plan for, and how much should I trust it?"
 *
 * This module adds a single typed prediction-atom ledger over those records.
 * It is deliberately NOT an LLM forecast and does not invent a base rate from
 * other companies. It uses the team's own recorded outcomes and three named
 * statistical ideas:
 *
 *  1. Brier (1950) proper scoring + Murphy (1973) decomposition for binary /
 *     tri-state decision forecasts. Probabilities are never mixed with money
 *     or days.
 *  2. Reference-class forecasting (Kahneman & Tversky, 1979; Flyvbjerg, 2006)
 *     on dimensionless actual÷forecast ratios. Amounts are never pooled
 *     across currencies; ratios are. Classes stay segmented by quantity and
 *     direction, because a late project and an under-priced vendor are not
 *     exchangeable just because both are numbers.
 *  3. A distribution-free conformal prediction band (Vovk et al., 2005;
 *     Angelopoulos & Bates, 2021). With n exchangeable calibration residuals
 *     the k = ceil((n+1)(1-alpha))-th ordered absolute relative residual gives
 *     marginal coverage >= k/(n+1) for the next outcome without assuming a
 *     normal, lognormal or any other error distribution. The UI states the
 *     exchangeability assumption and refuses to render a band below n=5.
 *
 * A two-sided exact sign test separates a real directional bias from one ugly
 * outlier. Below n=5 every cohort is counts-only. A challenge never rewrites
 * the recorded forecast: it is a separate, reviewable record shown BESIDE the
 * source estimate, linked through the same typed cross-module graph.
 *
 * Pure module: no DOM, storage, network or wall-clock globals. The injected
 * clock arrives through the post-commit rule context.
 */

import { addDays, dayKey } from '../time.js';
import {
  FORBIDDEN_LINK_TYPES,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  isCaseOpen,
  resolveLinkedEntity,
} from './cases.js';
import { pertTriple } from './capacity.js';
import {
  brierScore,
  buildCaseForecastSnapshot,
  caseCostPairs,
  decisionForecastPairs,
  estimatePairs,
  missingActualItems,
  missingCaseActuals,
  murphyDecomposition,
  negotiationSettlementCalibration,
  negotiationSettlementPairs,
} from './calibration.js';
import { commitmentCalibrationPairs } from './finance.js';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

export const FORECAST_MIN_SAMPLES = 5;
export const FORECAST_COVERAGE = 0.8;
export const FORECAST_OPTIMISM_RATIO = 1.25;
export const FORECAST_PADDING_RATIO = 0.8;
export const FORECAST_SIGN_ALPHA = 0.1;
export const FORECAST_CHALLENGE_STATUSES = ['open', 'accepted', 'adapted', 'dismissed'];
export const FORECAST_CHALLENGE_LABELS = {
  open: 'Awaiting review',
  accepted: 'Accepted outside view',
  adapted: 'Adapted outside view',
  dismissed: 'Dismissed with reason',
};

/** Post-commit events that can settle a promise and therefore re-score a class. */
export const FORECAST_OUTCOME_EVENTS = Object.freeze([
  'case.resolved',
  'case.actuals',
  'portfolio.actuals',
  'portfolio.completed',
  'budget.actualRecorded',
  'decision.reviewed',
  'negotiation.settled',
  'forecast.scan',
  'forecast.challenge.response',
]);

export const FORECAST_INTEGRITY_RULES = Object.freeze([
  {
    id: 'RULE-FCI-01',
    name: 'Outcome → conformal outside-view challenge fan-out',
    framework: 'Split conformal prediction (Vovk et al., 2005; Angelopoulos & Bates, 2021) & reference-class forecasting (Flyvbjerg, 2006)',
    trigger: 'any adapter-declared outcome event / forecast.scan',
    targetModule: 'forecastChallenges / cases / portfolio / budgets / negotiations / links',
    description: 'Scores a newly settled promise against its frozen forecast, then creates at most one idempotent, confidence-labelled outside-view challenge for every still-open forecast in the same reference class — in parallel, inside the source transaction.',
  },
  {
    id: 'RULE-FCI-02',
    name: 'Systematic bias → one DACI re-baseline decision',
    framework: 'DACI governance & exact two-sided sign test',
    trigger: 'reference class crosses the bias guardrail with open challenges',
    targetModule: 'decisions / links',
    description: 'Opens exactly one open DACI decision per flagged class with explicit options: use the reference-class central estimate, reserve at the conformal upper bound, investigate the estimation process, or accept the variance. It never rewrites a source estimate.',
  },
  {
    id: 'RULE-FCI-03',
    name: 'Measurement gaps → one owned evidence-recovery delegation',
    framework: 'Closed-loop measurement (Deming PDCA) & missing-not-at-random discipline',
    trigger: 'three or more resolved records lack recorded actuals',
    targetModule: 'delegations',
    description: 'Creates one blameless, idempotent delegation to recover the missing outcomes, because silently excluding unresolved forecasts would make the calibration curve flatter than reality.',
  },
  {
    id: 'RULE-FCI-04',
    name: 'Read-side forecast-integrity signals and board brief',
    framework: 'Brier/Murphy scoring, coverage diagnostics & confidence-weighted recommendations',
    trigger: 'render (write-free)',
    targetModule: 'insights / today / board brief',
    description: 'Surfaces unacknowledged challenges, systematic bias, interval-coverage failure, decision overconfidence and missing actuals as explainable FI-01..05 signals with one action each.',
  },
]);

const LEDGERS = Object.freeze({
  decisionProbability: { label: 'Decision confidence', family: 'probability', unit: 'probability' },
  portfolioEffort: { label: 'Plan effort', family: 'ratio', unit: 'days' },
  caseExposure: { label: 'Case exposure', family: 'ratio', unit: 'money' },
  caseDays: { label: 'Diverted capacity', family: 'ratio', unit: 'days' },
  caseSpend: { label: 'Mitigation spend', family: 'ratio', unit: 'money' },
  budgetCommitment: { label: 'Budget commitments', family: 'ratio', unit: 'money' },
  negotiationValue: { label: 'Negotiated value', family: 'ratio', unit: 'money' },
});

const SOURCE_COLLECTION = Object.freeze({
  case: 'cases',
  decision: 'decisions',
  portfolio: 'portfolio',
  budget: 'budgets',
  negotiation: 'negotiations',
});

/* ------------------------------------------------------------------ */
/* Numeric helpers — missing stays missing, never zero                  */
/* ------------------------------------------------------------------ */

function finite(value, fallback = null) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, dp = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(values, q) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] === undefined ? sorted[base] : sorted[base + 1];
  return sorted[base] + (next - sorted[base]) * rest;
}

/** Exact two-sided binomial sign test around ratio = 1. */
export function ratioSignTest(ratios = []) {
  const greater = ratios.filter((r) => Number.isFinite(r) && r > 1 + 1e-9).length;
  const less = ratios.filter((r) => Number.isFinite(r) && r < 1 - 1e-9).length;
  const n = greater + less;
  if (!n) return { n: 0, greater, less, p: null };
  const tail = Math.min(greater, less);
  let combinations = 1;
  let cumulative = 0;
  for (let i = 0; i <= tail; i += 1) {
    if (i > 0) combinations = (combinations * (n - i + 1)) / i;
    cumulative += combinations;
  }
  const p = Math.min(1, (2 * cumulative) / (2 ** n));
  return { n, greater, less, p: round(p, 4) };
}

/**
 * Distribution-free band on relative absolute error.
 *
 * residual_i = |actual_i / forecast_i − 1|. With n calibration residuals and
 * k = ceil((n+1)(1-alpha)), q = residual_(k) yields a band
 * [forecast·max(0,1−q), forecast·(1+q)] whose marginal coverage for a fresh
 * exchangeable outcome is at least k/(n+1). No distributional assumption is
 * made. A zero actual is representable (residual 1); it is NOT discarded.
 */
export function conformalBand(scoredAtoms = [], { coverage = FORECAST_COVERAGE, minSamples = FORECAST_MIN_SAMPLES } = {}) {
  const residuals = scoredAtoms
    .map((atom) => (Number.isFinite(atom.ratio) ? Math.abs(atom.ratio - 1) : null))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const n = residuals.length;
  const target = Math.min(0.99, Math.max(0.5, Number(coverage) || FORECAST_COVERAGE));
  const k = Math.ceil((n + 1) * target);
  if (n < minSamples || k > n) {
    return {
      sufficient: false,
      n,
      k,
      q: null,
      lowFactor: null,
      highFactor: null,
      coverageTarget: round(target, 2),
      coverageBound: null,
      reason: n < minSamples
        ? `Counts only below ${minSamples} scored outcomes.`
        : 'Finite-sample correction needs more calibration outcomes for this coverage level.',
    };
  }
  const q = residuals[k - 1];
  return {
    sufficient: true,
    n,
    k,
    q: round(q, 4),
    lowFactor: round(Math.max(0, 1 - q), 4),
    highFactor: round(1 + q, 4),
    coverageTarget: round(target, 2),
    coverageBound: round(k / (n + 1), 4),
    reason: null,
  };
}

export function bandForForecast(band, forecast) {
  if (!band?.sufficient || !Number.isFinite(forecast) || forecast <= 0) return null;
  return {
    low: round(Math.max(0, forecast * band.lowFactor), 2),
    central: round(forecast, 2),
    high: round(forecast * band.highFactor, 2),
    coverageBound: band.coverageBound,
    evidenceN: band.n,
  };
}

/* ------------------------------------------------------------------ */
/* Typed prediction atoms — the unified read model                     */
/* ------------------------------------------------------------------ */

function atom(base) {
  const forecast = finite(base.forecast);
  const actual = finite(base.actual);
  const family = base.family || 'ratio';
  const status = base.status || (actual === null ? 'open' : 'scored');
  const ratio = status === 'scored' && forecast > 0 && actual !== null
    ? round(actual / forecast, 4)
    : null;
  return {
    key: base.key,
    ledger: base.ledger,
    ledgerLabel: LEDGERS[base.ledger]?.label || base.ledger,
    quantity: base.quantity,
    quantityLabel: base.quantityLabel || base.quantity,
    classKey: base.classKey,
    family,
    sourceType: base.sourceType,
    sourceId: base.sourceId,
    sourceRef: base.sourceRef || null,
    sourceRoute: base.sourceRoute,
    title: String(base.title || 'Untitled forecast').slice(0, 180),
    forecast,
    actual,
    ratio,
    unit: base.unit || LEDGERS[base.ledger]?.unit || '',
    currency: base.currency || null,
    direction: base.direction || null,
    forecastOn: base.forecastOn || null,
    actualOn: base.actualOn || null,
    interval: base.interval || null,
    evidenceSource: base.evidenceSource || 'recorded',
    note: base.note || '',
    status,
  };
}

function openPortfolioEffort(item) {
  if (!item || item.kind === 'capacity-reserve' || item.status !== 'open') return null;
  if (finite(item.actualEffortDays) !== null) return null;
  const snap = item.forecastSnapshot;
  const live = pertTriple(item.effortDays || {});
  const expected = finite(snap?.effortExpected) > 0
    ? finite(snap.effortExpected)
    : live.measured && live.expected > 0 ? live.expected : null;
  if (!(expected > 0)) return null;
  return {
    expected,
    low: finite(snap?.effortP10) ?? live.p10,
    high: finite(snap?.effortP90) ?? live.p90,
    source: snap ? 'snapshot' : 'current-estimate',
  };
}

function caseSnapshot(caseRecord) {
  const existing = caseRecord.forecastSnapshot;
  if (existing && (finite(existing.costExpected) > 0 || finite(existing.capacityDaysExpected) > 0 || finite(existing.mitigationCost) > 0)) {
    return existing;
  }
  return buildCaseForecastSnapshot(caseRecord, caseRecord.openedOn) || {};
}

/** Pure adapter registry. Add one adapter and a new module joins the engine. */
export const FORECAST_ADAPTERS = Object.freeze([
  {
    id: 'decisionProbability',
    label: LEDGERS.decisionProbability.label,
    events: ['decision.reviewed'],
    collect(state) {
      const pairs = decisionForecastPairs(state);
      const reviewed = new Set(pairs.map((pair) => pair.decisionId));
      const out = pairs.map((pair) => atom({
        key: `decisionProbability:${pair.decisionId}:probability`,
        ledger: 'decisionProbability',
        quantity: 'probability',
        quantityLabel: 'P(good outcome)',
        classKey: 'probability:decision',
        family: 'probability',
        sourceType: 'decision',
        sourceId: pair.decisionId,
        sourceRoute: '#/decisions',
        title: pair.title,
        forecast: pair.p,
        actual: pair.o,
        unit: 'probability',
        forecastOn: pair.date,
        actualOn: pair.reviewedOn,
        evidenceSource: 'reviewed decision',
        status: 'scored',
      }));
      for (const d of state.decisions || []) {
        if (!d.chosen || reviewed.has(d.id) || d.reviewedOn) continue;
        const p = finite(d.forecastProbability);
        if (p === null) continue;
        out.push(atom({
          key: `decisionProbability:${d.id}:probability`,
          ledger: 'decisionProbability',
          quantity: 'probability',
          quantityLabel: 'P(good outcome)',
          classKey: 'probability:decision',
          family: 'probability',
          sourceType: 'decision',
          sourceId: d.id,
          sourceRoute: '#/decisions',
          title: d.title,
          forecast: Math.min(0.95, Math.max(0.05, p / 100)),
          actual: null,
          unit: 'probability',
          forecastOn: d.date,
          status: 'open',
        }));
      }
      return out;
    },
  },
  {
    id: 'portfolioEffort',
    label: LEDGERS.portfolioEffort.label,
    events: ['portfolio.actuals', 'portfolio.completed'],
    collect(state) {
      const out = estimatePairs(state).map((pair) => atom({
        key: `portfolioEffort:${pair.itemId}:effort-days`,
        ledger: 'portfolioEffort',
        quantity: 'effort-days',
        quantityLabel: 'Delivery effort',
        classKey: 'ratio:effort-days',
        sourceType: 'portfolio',
        sourceId: pair.itemId,
        sourceRoute: '#/capacity',
        title: pair.title,
        forecast: pair.expected,
        actual: pair.actual,
        unit: 'days',
        forecastOn: null,
        actualOn: pair.completedOn,
        interval: { low: pair.p10, high: pair.p90 },
        evidenceSource: pair.source === 'snapshot' ? 'funding-time snapshot' : 'current estimate',
        status: 'scored',
      }));
      for (const item of state.portfolio || []) {
        const estimate = openPortfolioEffort(item);
        if (!estimate) continue;
        out.push(atom({
          key: `portfolioEffort:${item.id}:effort-days`,
          ledger: 'portfolioEffort',
          quantity: 'effort-days',
          quantityLabel: 'Delivery effort',
          classKey: 'ratio:effort-days',
          sourceType: 'portfolio',
          sourceId: item.id,
          sourceRoute: '#/capacity',
          title: item.title,
          forecast: estimate.expected,
          actual: null,
          unit: 'days',
          forecastOn: item.forecastSnapshot?.fundedOn || item.createdOn || null,
          interval: { low: estimate.low, high: estimate.high },
          evidenceSource: estimate.source,
          status: 'open',
        }));
      }
      return out;
    },
  },
  {
    id: 'caseLedger',
    label: 'Operational case settlement',
    events: ['case.resolved', 'case.actuals'],
    collect(state) {
      const out = [];
      for (const pair of caseCostPairs(state)) {
        const currency = pair.currency || 'USD';
        if (pair.exposureRatio !== null) {
          out.push(atom({
            key: `caseExposure:${pair.caseId}:cost`,
            ledger: 'caseExposure',
            quantity: 'cost',
            quantityLabel: 'Realised exposure',
            classKey: `ratio:case-exposure:${currency}`,
            sourceType: 'case',
            sourceId: pair.caseId,
            sourceRoute: `#/cases/${pair.caseId}`,
            title: pair.title,
            forecast: pair.costExpected,
            actual: pair.realisedExposure,
            unit: currency,
            currency,
            forecastOn: pair.openedOn,
            actualOn: pair.settledOn,
            interval: { low: pair.costP10, high: pair.costP90 },
            evidenceSource: pair.source,
            status: 'scored',
          }));
        }
        if (pair.daysRatio !== null) {
          out.push(atom({
            key: `caseDays:${pair.caseId}:days`,
            ledger: 'caseDays',
            quantity: 'days',
            quantityLabel: 'Diverted person-days',
            classKey: 'ratio:case-diverted-days',
            sourceType: 'case',
            sourceId: pair.caseId,
            sourceRoute: `#/cases/${pair.caseId}`,
            title: pair.title,
            forecast: pair.capacityExpected,
            actual: pair.divertedDays,
            unit: 'days',
            forecastOn: pair.openedOn,
            actualOn: pair.settledOn,
            evidenceSource: pair.source,
            status: 'scored',
          }));
        }
        if (pair.spendRatio !== null) {
          out.push(atom({
            key: `caseSpend:${pair.caseId}:spend`,
            ledger: 'caseSpend',
            quantity: 'spend',
            quantityLabel: 'Mitigation spend',
            classKey: `ratio:case-mitigation-spend:${currency}`,
            sourceType: 'case',
            sourceId: pair.caseId,
            sourceRoute: `#/cases/${pair.caseId}`,
            title: pair.title,
            forecast: pair.plannedMitigationCost,
            actual: pair.mitigationSpend,
            unit: currency,
            currency,
            forecastOn: pair.openedOn,
            actualOn: pair.settledOn,
            evidenceSource: pair.source,
            status: 'scored',
          }));
        }
      }
      for (const c of state.cases || []) {
        if (!isCaseOpen(c)) continue;
        const snap = caseSnapshot(c);
        const currency = snap.currency || 'USD';
        const cost = finite(snap.costExpected);
        const days = finite(snap.capacityDaysExpected);
        const spend = finite(snap.mitigationCost);
        if (cost > 0) {
          out.push(atom({
            key: `caseExposure:${c.id}:cost`,
            ledger: 'caseExposure',
            quantity: 'cost',
            quantityLabel: 'Realised exposure',
            classKey: `ratio:case-exposure:${currency}`,
            sourceType: 'case',
            sourceId: c.id,
            sourceRoute: `#/cases/${c.id}`,
            title: c.title,
            forecast: cost,
            actual: null,
            unit: currency,
            currency,
            forecastOn: snap.frozenOn || c.openedOn,
            interval: { low: finite(snap.costP10), high: finite(snap.costP90) },
            evidenceSource: c.forecastSnapshot ? 'frozen opening forecast' : 'current estimate',
            status: 'open',
          }));
        }
        if (days > 0) {
          out.push(atom({
            key: `caseDays:${c.id}:days`,
            ledger: 'caseDays',
            quantity: 'days',
            quantityLabel: 'Diverted person-days',
            classKey: 'ratio:case-diverted-days',
            sourceType: 'case',
            sourceId: c.id,
            sourceRoute: `#/cases/${c.id}`,
            title: c.title,
            forecast: days,
            actual: null,
            unit: 'days',
            forecastOn: snap.frozenOn || c.openedOn,
            evidenceSource: c.forecastSnapshot ? 'frozen opening forecast' : 'current estimate',
            status: 'open',
          }));
        }
        if (spend > 0) {
          out.push(atom({
            key: `caseSpend:${c.id}:spend`,
            ledger: 'caseSpend',
            quantity: 'spend',
            quantityLabel: 'Mitigation spend',
            classKey: `ratio:case-mitigation-spend:${currency}`,
            sourceType: 'case',
            sourceId: c.id,
            sourceRoute: `#/cases/${c.id}`,
            title: c.title,
            forecast: spend,
            actual: null,
            unit: currency,
            currency,
            forecastOn: snap.frozenOn || c.openedOn,
            evidenceSource: c.forecastSnapshot ? 'frozen opening forecast' : 'current estimate',
            status: 'open',
          }));
        }
      }
      return out;
    },
  },
  {
    id: 'budgetCommitment',
    label: LEDGERS.budgetCommitment.label,
    events: ['budget.actualRecorded'],
    collect(state) {
      const { pairs } = commitmentCalibrationPairs(state);
      const scoredKeys = new Set(pairs.map((p) => `${p.budgetId}:${p.lineId}`));
      const out = pairs.map((pair) => atom({
        key: `budgetCommitment:${pair.budgetId}:${pair.lineId}:amount`,
        ledger: 'budgetCommitment',
        quantity: 'amount',
        quantityLabel: 'Recorded spend',
        classKey: `ratio:budget-commitment:${pair.currency || 'USD'}`,
        sourceType: 'budget',
        sourceId: pair.budgetId,
        sourceRef: pair.lineId,
        sourceRoute: `#/finance/${pair.budgetId}`,
        title: pair.title,
        forecast: pair.committedAmount,
        actual: pair.actualAmount,
        unit: pair.currency || 'USD',
        currency: pair.currency || 'USD',
        forecastOn: null,
        actualOn: pair.spentOn,
        evidenceSource: 'encumbered commitment',
        status: 'scored',
      }));
      for (const budget of state.budgets || []) {
        const currency = budget.currency || 'USD';
        for (const line of budget.lines || []) {
          if (line.status !== 'committed' || scoredKeys.has(`${budget.id}:${line.id}`)) continue;
          const committed = finite(line.committedAmount);
          if (!(committed > 0)) continue;
          out.push(atom({
            key: `budgetCommitment:${budget.id}:${line.id}:amount`,
            ledger: 'budgetCommitment',
            quantity: 'amount',
            quantityLabel: 'Recorded spend',
            classKey: `ratio:budget-commitment:${currency}`,
            sourceType: 'budget',
            sourceId: budget.id,
            sourceRef: line.id,
            sourceRoute: `#/finance/${budget.id}`,
            title: line.title,
            forecast: committed,
            actual: null,
            unit: currency,
            currency,
            forecastOn: line.committedOn,
            evidenceSource: 'open encumbrance',
            status: 'open',
          }));
        }
      }
      return out;
    },
  },
  {
    id: 'negotiationValue',
    label: LEDGERS.negotiationValue.label,
    events: ['negotiation.settled'],
    collect(state) {
      const pairs = negotiationSettlementPairs(state);
      const settled = new Set(pairs.map((p) => p.negotiationId));
      const out = pairs.map((pair) => atom({
        key: `negotiationValue:${pair.negotiationId}:value`,
        ledger: 'negotiationValue',
        quantity: 'value',
        quantityLabel: 'Realised deal value',
        classKey: `ratio:negotiation-value:${pair.direction}:${pair.currency}`,
        sourceType: 'negotiation',
        sourceId: pair.negotiationId,
        sourceRoute: `#/negotiations/${pair.negotiationId}`,
        title: pair.title,
        forecast: pair.agreedValue,
        actual: pair.realisedValue,
        unit: pair.currency,
        currency: pair.currency,
        direction: pair.direction,
        forecastOn: pair.agreedOn,
        actualOn: pair.settledOn,
        evidenceSource: 'explicit signed and realised value',
        status: 'scored',
      }));
      for (const n of state.negotiations || []) {
        if (n.status !== 'agreed' || settled.has(n.id)) continue;
        const stakes = finite(n.stakesValue);
        if (!(stakes > 0)) continue;
        const realised = finite(n.settlement?.realisedValue);
        if (realised !== null) continue;
        const direction = n.dealDirection === 'minimize' ? 'minimize' : 'maximize';
        const currency = String(n.stakesCurrency || 'USD').toUpperCase();
        out.push(atom({
          key: `negotiationValue:${n.id}:value`,
          ledger: 'negotiationValue',
          quantity: 'value',
          quantityLabel: 'Realised deal value',
          classKey: `ratio:negotiation-value:${direction}:${currency}`,
          sourceType: 'negotiation',
          sourceId: n.id,
          sourceRoute: `#/negotiations/${n.id}`,
          title: n.title,
          forecast: stakes,
          actual: null,
          unit: currency,
          currency,
          direction,
          forecastOn: n.closedOn || n.openedOn,
          evidenceSource: 'signed value, realised value not recorded',
          status: 'open',
        }));
      }
      return out;
    },
  },
]);

/** One flat, deterministic ledger of every typed prediction in the workspace. */
export function buildForecastAtoms(state = {}) {
  const atoms = [];
  for (const adapter of FORECAST_ADAPTERS) {
    for (const item of adapter.collect(state) || []) {
      if (item && item.forecast !== null && item.forecast > 0) atoms.push(item);
    }
  }
  return atoms.sort((a, b) => a.key.localeCompare(b.key));
}

function missingActuals(state) {
  const out = [];
  for (const item of missingActualItems(state)) {
    out.push({ sourceType: 'portfolio', sourceId: item.itemId, title: item.title, ledger: 'portfolioEffort', reason: 'Delivered work has no recorded effort actual.', route: '#/capacity' });
  }
  for (const c of missingCaseActuals(state)) {
    out.push({ sourceType: 'case', sourceId: c.caseId || c.id, title: c.title, ledger: 'caseExposure', reason: 'Resolved case has no settled actuals.', route: c.caseId ? `#/cases/${c.caseId}` : '#/cases' });
  }
  const budget = commitmentCalibrationPairs(state);
  for (const item of budget.missingItems) {
    out.push({ sourceType: 'budget', sourceId: item.budgetId, title: item.title, ledger: 'budgetCommitment', reason: item.reason, route: `#/finance/${item.budgetId}` });
  }
  const negotiation = negotiationSettlementCalibration(state);
  for (const item of negotiation.missingItems || []) {
    out.push({ sourceType: 'negotiation', sourceId: item.negotiationId, title: item.title, ledger: 'negotiationValue', reason: item.reason, route: `#/negotiations/${item.negotiationId}` });
  }
  return out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
}

function classLabel(key, atoms) {
  const first = atoms[0];
  const parts = key.split(':');
  if (parts[0] === 'probability') return 'Decision probabilities';
  const label = LEDGERS[first?.ledger]?.label || parts[1] || key;
  const currency = first?.currency && first?.unit === first?.currency ? ` · ${first.currency}` : '';
  const direction = first?.direction ? ` · ${first.direction}` : '';
  return `${label}${currency}${direction}`;
}

function analyzeClass(key, atoms, coverage) {
  const scored = atoms.filter((a) => a.status === 'scored' && Number.isFinite(a.ratio));
  const open = atoms.filter((a) => a.status === 'open');
  const ratios = scored.map((a) => a.ratio);
  const n = ratios.length;
  const sufficient = n >= FORECAST_MIN_SAMPLES;
  const medianRatio = sufficient ? round(median(ratios), 3) : null;
  const sign = sufficient ? ratioSignTest(ratios) : ratioSignTest([]);
  const band = conformalBand(scored, { coverage });
  const optimistic = Boolean(sufficient && medianRatio >= FORECAST_OPTIMISM_RATIO && sign.p <= FORECAST_SIGN_ALPHA);
  const padded = Boolean(sufficient && medianRatio <= FORECAST_PADDING_RATIO && sign.p <= FORECAST_SIGN_ALPHA);
  const biasFlag = optimistic || padded;
  const confidence = !biasFlag ? 'insufficient' : n >= 10 && sign.p <= 0.05 ? 'high' : 'medium';
  return {
    key,
    label: classLabel(key, atoms),
    ledger: atoms[0]?.ledger || null,
    family: atoms[0]?.family || 'ratio',
    unit: atoms[0]?.unit || '',
    scored,
    open,
    n,
    openCount: open.length,
    minSamples: FORECAST_MIN_SAMPLES,
    sufficient,
    medianRatio,
    meanRatio: sufficient ? round(ratios.reduce((s, r) => s + r, 0) / n, 3) : null,
    p80Ratio: sufficient ? round(quantile(ratios, 0.8), 3) : null,
    signP: sign.p,
    signGreater: sign.greater,
    signLess: sign.less,
    band,
    biasFlag,
    biasDirection: optimistic ? 'optimistic' : padded ? 'padded' : 'balanced',
    confidence,
    verdict: !sufficient
      ? { id: 'collecting', label: `Collecting evidence (${n}/${FORECAST_MIN_SAMPLES})`, detail: 'Counts only. No band, median or verdict is rendered below the sample floor.' }
      : optimistic
        ? { id: 'optimistic', label: `Systematic under-estimation (${medianRatio}×)`, detail: `The median settled outcome is ${medianRatio}× the recorded forecast and the exact two-sided sign test is p=${sign.p}. Plan with the outside view, not the inside story.` }
        : padded
          ? { id: 'padded', label: `Systematic padding (${medianRatio}×)`, detail: `The median settled outcome is ${medianRatio}× the recorded forecast and the exact two-sided sign test is p=${sign.p}. Excess contingency has an opportunity cost.` }
          : { id: 'balanced', label: 'No directional bias detected', detail: `Median ${medianRatio}× over ${n} outcomes; sign test p=${sign.p}. Keep scoring rather than declaring victory.` },
  };
}

function probabilitySummary(atoms) {
  const scored = atoms.filter((a) => a.family === 'probability' && a.status === 'scored');
  const pairs = scored.map((a) => ({ p: a.forecast, o: a.actual }));
  const open = atoms.filter((a) => a.family === 'probability' && a.status === 'open');
  const brier = pairs.length ? brierScore(pairs) : null;
  const meanForecast = pairs.length ? pairs.reduce((s, p) => s + p.p, 0) / pairs.length : null;
  const observedRate = pairs.length ? pairs.reduce((s, p) => s + p.o, 0) / pairs.length : null;
  return {
    n: pairs.length,
    openCount: open.length,
    sufficient: pairs.length >= FORECAST_MIN_SAMPLES,
    brier,
    murphy: pairs.length ? murphyDecomposition(pairs) : null,
    meanForecast: meanForecast === null ? null : round(meanForecast, 4),
    observedRate: observedRate === null ? null : round(observedRate, 4),
    biasPp: meanForecast === null ? null : round((meanForecast - observedRate) * 100, 1),
  };
}

function intervalCoverage(atoms) {
  const rows = atoms.filter((a) => a.status === 'scored' && a.interval && Number.isFinite(a.interval.low) && Number.isFinite(a.interval.high) && a.actual !== null);
  if (!rows.length) return { n: 0, covered: 0, rate: null, sufficient: false };
  const covered = rows.filter((a) => a.actual >= a.interval.low && a.actual <= a.interval.high).length;
  return {
    n: rows.length,
    covered,
    rate: rows.length >= FORECAST_MIN_SAMPLES ? round(covered / rows.length, 3) : null,
    sufficient: rows.length >= FORECAST_MIN_SAMPLES,
  };
}

function boardBrief(report, state, now) {
  const lines = [];
  const day = dayKey(now);
  lines.push(`FORECAST INTEGRITY BRIEF — ${day}`);
  lines.push('Local-first · manager-entered evidence · no external model or invoice verification.');
  lines.push('');
  lines.push(`Verdict: ${report.verdict.label}. ${report.verdict.detail}`);
  lines.push(`Scored outcomes: ${report.scored.length}. Open promises: ${report.open.length}. Missing actuals: ${report.missingActuals.length}. Open challenges: ${report.openChallenges}.`);
  if (report.global.sufficient) {
    lines.push(`Pooled dimensionless ratio: median ${report.global.medianRatio}× over ${report.global.n} settled promises; exact sign test p=${report.global.signP}. Mixed quantities — descriptive only.`);
  } else {
    lines.push(`Pooled ratio evidence is counts-only (${report.global.n}/${FORECAST_MIN_SAMPLES}).`);
  }
  if (report.global.band.sufficient) {
    lines.push(`Distribution-free ${Math.round(report.global.band.coverageTarget * 100)}% band: ${report.global.band.lowFactor}×–${report.global.band.highFactor}× the recorded estimate; finite-sample coverage bound ${report.global.band.coverageBound}. Assumes exchangeability.`);
  }
  if (report.probability.n) {
    lines.push(`Decision forecasts: Brier ${report.probability.brier} over ${report.probability.n} reviewed call(s); mean forecast ${Math.round((report.probability.meanForecast || 0) * 100)}% vs observed ${Math.round((report.probability.observedRate || 0) * 100)}%.`);
  }
  if (report.coverage.n) {
    lines.push(`Recorded P10–P90 ranges covered ${report.coverage.covered}/${report.coverage.n} settled outcomes${report.coverage.rate === null ? ' (counts only below n=5)' : ` (${Math.round(report.coverage.rate * 100)}%)`}.`);
  }
  const flagged = report.classes.filter((c) => c.biasFlag).slice(0, 3);
  if (flagged.length) {
    lines.push('');
    lines.push('Reference classes needing a decision:');
    for (const cls of flagged) lines.push(`- ${cls.label}: ${cls.verdict.label}; n=${cls.n}; confidence=${cls.confidence}; ${cls.openCount} open forecast(s).`);
  }
  if (report.missingActuals.length) {
    lines.push('');
    lines.push('Measurement gaps (never silently excluded):');
    for (const item of report.missingActuals.slice(0, 5)) lines.push(`- ${item.title}: ${item.reason}`);
    if (report.missingActuals.length > 5) lines.push(`- …and ${report.missingActuals.length - 5} more.`);
  }
  lines.push('');
  lines.push('Method limits: n=5 floor, 1.25×/0.80× bias edges, p≤0.10 sign-test guardrail and 80% coverage are transparent operational conventions, not externally validated constants. Exchangeability can fail after a process change; re-run the scan after each new outcome.');
  return lines.join('\n');
}

/** Full pure report: one call drives the UI, signals, CSV, brief and rules. */
export function forecastIntegrityReport(state = {}, now = new Date()) {
  const atoms = buildForecastAtoms(state);
  const coverage = finite(state.settings?.forecastCoveragePct, 80) / 100;
  const ratioAtoms = atoms.filter((a) => a.family === 'ratio');
  const grouped = new Map();
  for (const item of ratioAtoms) {
    const list = grouped.get(item.classKey) || [];
    list.push(item);
    grouped.set(item.classKey, list);
  }
  const classes = [...grouped.entries()]
    .map(([key, list]) => analyzeClass(key, list, coverage))
    .sort((a, b) => Number(b.biasFlag) - Number(a.biasFlag) || b.n - a.n || a.key.localeCompare(b.key));
  const scored = atoms.filter((a) => a.status === 'scored');
  const open = atoms.filter((a) => a.status === 'open');
  const globalScored = scored.filter((a) => a.family === 'ratio');
  const globalRatios = globalScored.map((a) => a.ratio).filter(Number.isFinite);
  const globalSufficient = globalRatios.length >= FORECAST_MIN_SAMPLES;
  const globalMedian = globalSufficient ? round(median(globalRatios), 3) : null;
  const globalSign = globalSufficient ? ratioSignTest(globalRatios) : ratioSignTest([]);
  const globalBand = conformalBand(globalScored, { coverage });
  const probability = probabilitySummary(atoms);
  const missing = missingActuals(state);
  const openChallenges = (state.forecastChallenges || []).filter((c) => c.status === 'open').length;
  const flagged = classes.filter((c) => c.biasFlag);
  const globalBiasFlag = Boolean(globalSufficient && globalMedian !== null && globalSign.p <= FORECAST_SIGN_ALPHA
    && (globalMedian >= FORECAST_OPTIMISM_RATIO || globalMedian <= FORECAST_PADDING_RATIO));
  const globalBiasDirection = globalMedian !== null && globalMedian >= FORECAST_OPTIMISM_RATIO
    ? 'optimistic'
    : globalMedian !== null && globalMedian <= FORECAST_PADDING_RATIO ? 'padded' : 'balanced';
  // A low-confidence pooled prior lets one module's settled evidence reach
  // open forecasts in classes that have too little evidence of their own.
  // It is explicitly labelled mixed-quantity and never overwrites a class band.
  const globalClass = globalBiasFlag && globalBand.sufficient ? {
    key: 'global:mixed-quantity',
    label: 'Mixed-quantity global prior',
    ledger: null,
    family: 'ratio',
    unit: '×',
    n: globalRatios.length,
    openCount: 0,
    medianRatio: globalMedian,
    signP: globalSign.p,
    band: globalBand,
    biasFlag: true,
    biasDirection: globalBiasDirection,
    confidence: 'low',
    verdict: {
      id: 'global-bias',
      label: `Pooled ${globalMedian}× planning bias`,
      detail: 'Pooled dimensionless ratios are descriptive across unlike quantities. This low-confidence prior is used only where a class has too little evidence of its own.',
    },
  } : null;
  const verdict = !globalSufficient
    ? { id: 'collecting', label: 'Evidence is still accumulating', detail: `Only ${globalRatios.length} scored ratio outcome(s) exist. Counts are visible; no pooled verdict or automatic challenge is issued below ${FORECAST_MIN_SAMPLES}.` }
    : flagged.length
      ? { id: 'bias', label: `${flagged.length} reference class(es) show directional bias`, detail: flagged.map((c) => `${c.label} ${c.medianRatio}× (n=${c.n}, p=${c.signP})`).join('; ') }
      : { id: 'balanced', label: 'No systematic directional bias detected', detail: `Pooled median ${globalMedian}× across ${globalRatios.length} settled promises (sign test p=${globalSign.p}). Coverages and missing actuals still need attention.` };

  const report = {
    generatedOn: dayKey(now),
    coverageTarget: round(coverage, 2),
    minSamples: FORECAST_MIN_SAMPLES,
    atoms,
    scored,
    open,
    classes,
    ledgers: Object.entries(LEDGERS).map(([id, meta]) => {
      const list = atoms.filter((a) => a.ledger === id);
      return {
        id,
        label: meta.label,
        family: meta.family,
        unit: meta.unit,
        total: list.length,
        scored: list.filter((a) => a.status === 'scored').length,
        open: list.filter((a) => a.status === 'open').length,
      };
    }),
    global: {
      n: globalRatios.length,
      sufficient: globalSufficient,
      medianRatio: globalMedian,
      signP: globalSign.p,
      biasFlag: globalBiasFlag,
      biasDirection: globalBiasDirection,
      confidence: globalClass ? 'low' : 'insufficient',
      band: { ...globalBand, mixedQuantities: true },
      verdict,
    },
    globalClass,
    probability,
    coverage: intervalCoverage(scored),
    missingActuals: missing,
    openChallenges,
    flaggedClasses: flagged,
    verdict,
  };
  report.boardBrief = boardBrief(report, state, now);
  return report;
}

/** Candidate challenges for every open atom in a flagged, banded class. */
export function forecastChallengeCandidates(report, state = {}) {
  const challenges = (state.forecastChallenges || []);
  const out = [];
  for (const cls of report.classes) {
    if (!cls.biasFlag || !cls.band.sufficient) continue;
    for (const item of cls.open) {
      const band = bandForForecast(cls.band, item.forecast);
      if (!band) continue;
      const existing = challenges.find((c) => c.atomKey === item.key);
      if (existing && existing.status !== 'open') continue;
      const fingerprint = [
        cls.n,
        cls.medianRatio,
        cls.signP,
        cls.band.q,
        item.forecast,
        item.key,
      ].join('|');
      out.push({
        atomKey: item.key,
        classKey: cls.key,
        ledger: item.ledger,
        quantity: item.quantity,
        quantityLabel: item.quantityLabel,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        sourceRef: item.sourceRef,
        sourceRoute: item.sourceRoute,
        title: item.title,
        recordedForecast: round(item.forecast, 2),
        unit: item.unit,
        currency: item.currency,
        direction: item.direction,
        forecastOn: item.forecastOn,
        medianRatio: cls.medianRatio,
        referenceClassCentral: round(item.forecast * cls.medianRatio, 2),
        bandLow: band.low,
        bandHigh: band.high,
        coverageBound: band.coverageBound,
        coverageTarget: cls.band.coverageTarget,
        evidenceN: cls.n,
        signP: cls.signP,
        biasDirection: cls.biasDirection,
        confidence: cls.confidence,
        bandScope: 'class',
        fingerprint,
        ruleId: 'RULE-FCI-01',
        note: `Recorded forecast is unchanged. Outside-view central ${round(item.forecast * cls.medianRatio, 2)} ${item.unit} and ${Math.round(cls.band.coverageTarget * 100)}% conformal band ${band.low}–${band.high} ${item.unit} are shown beside it.`,
      });
    }
  }

  // Cross-module fan-out: where the pooled evidence is directionally biased,
  // open forecasts in OTHER modules with too little class evidence receive a
  // clearly lower-confidence mixed-quantity challenge. A class-specific
  // challenge always wins over the pooled prior for the same atom.
  const globalCls = report.globalClass;
  if (globalCls) {
    const covered = new Set([
      ...challenges.map((c) => c.atomKey),
      ...out.map((c) => c.atomKey),
    ]);
    for (const item of report.open) {
      if (item.family !== 'ratio' || covered.has(item.key)) continue;
      const own = report.classes.find((c) => c.key === item.classKey);
      if (own?.biasFlag && own.band.sufficient) continue;
      const band = bandForForecast(globalCls.band, item.forecast);
      if (!band) continue;
      const fingerprint = [
        globalCls.n,
        globalCls.medianRatio,
        globalCls.signP,
        globalCls.band.q,
        item.forecast,
        item.key,
        'global',
      ].join('|');
      out.push({
        atomKey: item.key,
        classKey: globalCls.key,
        ledger: item.ledger,
        quantity: item.quantity,
        quantityLabel: item.quantityLabel,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        sourceRef: item.sourceRef,
        sourceRoute: item.sourceRoute,
        title: item.title,
        recordedForecast: round(item.forecast, 2),
        unit: item.unit,
        currency: item.currency,
        direction: item.direction,
        forecastOn: item.forecastOn,
        medianRatio: globalCls.medianRatio,
        referenceClassCentral: round(item.forecast * globalCls.medianRatio, 2),
        bandLow: band.low,
        bandHigh: band.high,
        coverageBound: band.coverageBound,
        coverageTarget: globalCls.band.coverageTarget,
        evidenceN: globalCls.n,
        signP: globalCls.signP,
        biasDirection: globalCls.biasDirection,
        confidence: 'low',
        bandScope: 'mixed-quantity-global',
        fingerprint,
        ruleId: 'RULE-FCI-01',
        note: `Recorded forecast is unchanged. This ${round(item.forecast * globalCls.medianRatio, 2)} ${item.unit} central estimate uses a LOW-CONFIDENCE pooled prior across unlike quantities because ${item.classKey} has too few settled outcomes. Treat it as a prompt to check the estimate, not a class-specific forecast.`,
      });
    }
  }
  return out;
}

/** Read-side signals for the main insights engine (RULE-FCI-04). */
export function forecastIntegritySignals(state = {}, now = new Date()) {
  const report = forecastIntegrityReport(state, now);
  const findings = [];
  const openChallenges = (state.forecastChallenges || []).filter((c) => c.status === 'open');
  const flagged = report.flaggedClasses;
  if (flagged.length && (openChallenges.length || flagged.some((c) => c.n >= 8 && c.signP <= 0.05))) {
    const worst = flagged[0];
    findings.push({
      ruleId: 'FI-01', domain: 'Forecast integrity', severity: worst.confidence === 'high' ? 4 : 3, confidence: worst.confidence === 'high' ? 'high' : 'medium',
      title: `${flagged.length} reference class(es) show systematic forecast bias`,
      detail: `${worst.label}: median ${worst.medianRatio}× over ${worst.n} settled outcomes, exact sign test p=${worst.signP}. RULE-FCI-01 challenges open forecasts of the same class and RULE-FCI-02 opens one DACI re-baseline decision; no source estimate is rewritten.`,
      evidence: [`Conformal ${Math.round(worst.band.coverageTarget * 100)}% band factor ${worst.band.lowFactor}×–${worst.band.highFactor}×`, `Coverage bound ${worst.band.coverageBound}`, `Evidence confidence: ${worst.confidence}`],
      action: { label: 'Open forecast integrity', route: '#/forecasts?tab=classes' },
    });
  }
  if (openChallenges.length) {
    findings.push({
      ruleId: 'FI-02', domain: 'Forecast integrity', severity: 3, confidence: 'high',
      title: `${openChallenges.length} outside-view challenge(s) await a leader response`,
      detail: 'Each challenge shows the recorded estimate, the reference-class central outcome and a distribution-free band. Accept, adapt or dismiss with a written reason; the decision is yours, not the model’s.',
      evidence: [`${openChallenges.length} open challenge(s)`, 'No recorded forecast has been rewritten'],
      action: { label: 'Review challenges', route: '#/forecasts?tab=challenges' },
    });
  }
  if (report.missingActuals.length >= 3) {
    findings.push({
      ruleId: 'FI-03', domain: 'Forecast integrity', severity: 3, confidence: 'high',
      title: `${report.missingActuals.length} settled records have no actual outcome`,
      detail: 'Missing actuals are not zeroes and are never silently excluded. RULE-FCI-03 opens one owned evidence-recovery delegation when the gap reaches three.',
      evidence: [`${report.missingActuals.length} missing outcome(s)`, `Scored outcomes available: ${report.scored.length}`],
      action: { label: 'Open measurement gaps', route: '#/forecasts?tab=ledgers' },
    });
  }
  if (report.coverage.sufficient && report.coverage.rate < 0.6) {
    findings.push({
      ruleId: 'FI-04', domain: 'Forecast integrity', severity: 3, confidence: 'medium',
      title: 'Recorded estimate ranges miss most real outcomes',
      detail: `Only ${Math.round(report.coverage.rate * 100)}% of ${report.coverage.n} settled outcomes landed inside their recorded P10–P90 range. The distribution-free band is derived from outcomes instead of assumed normal spread.`,
      evidence: [`${report.coverage.covered}/${report.coverage.n} inside range`, '60% coverage floor is a product guardrail'],
      action: { label: 'Inspect classes', route: '#/forecasts?tab=classes' },
    });
  }
  if (report.probability.sufficient && Math.abs(report.probability.biasPp) >= 15) {
    findings.push({
      ruleId: 'FI-05', domain: 'Forecast integrity', severity: 3, confidence: 'medium',
      title: 'Decision confidence is drifting away from observed outcomes',
      detail: `Mean forecast ${Math.round(report.probability.meanForecast * 100)}% vs observed ${Math.round(report.probability.observedRate * 100)}% over ${report.probability.n} reviewed decisions (Brier ${report.probability.brier}). Probabilities are scored separately from money and days.`,
      evidence: [`Bias ${report.probability.biasPp} percentage points`, `Brier ${report.probability.brier}`],
      action: { label: 'Open forecast integrity', route: '#/forecasts?tab=overview' },
    });
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Post-commit rule — generalized, idempotent, cross-module            */
/* ------------------------------------------------------------------ */

function ensureLink(draft, spec, ctx) {
  const { sourceType, sourceId, targetType, targetId, relation } = spec;
  if (
    !LINK_ENTITY_TYPES.includes(sourceType) || !LINK_ENTITY_TYPES.includes(targetType) ||
    FORBIDDEN_LINK_TYPES.includes(sourceType) || FORBIDDEN_LINK_TYPES.includes(targetType) ||
    !LINK_RELATIONS.includes(relation) || !sourceId || !targetId ||
    !resolveLinkedEntity(draft, sourceType, sourceId) || !resolveLinkedEntity(draft, targetType, targetId)
  ) return { created: false, link: null };
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const existing = draft.links.find((l) => l && l.sourceType === sourceType && l.sourceId === sourceId &&
    l.targetType === targetType && l.targetId === targetId && l.relation === relation);
  if (existing) return { created: false, link: existing };
  const link = {
    id: ctx.idFactory('lnk'),
    sourceType, sourceId, targetType, targetId, relation,
    ruleId: spec.ruleId || '',
    summary: String(spec.summary || '').slice(0, 300),
    createdOn: ctx.todayStr,
    createdAt: ctx.nowIso,
  };
  draft.links.push(link);
  return { created: true, link };
}

function decisionForClass(draft, cls, candidates, ctx, report) {
  const marker = `[RULE-FCI-02:${cls.key}]`;
  const open = (draft.decisions || []).find((d) => !d.chosen && String(d.question || '').includes(marker));
  if (open) return null;
  const unit = cls.unit || '';
  const decision = {
    id: ctx.idFactory('dec'),
    title: `Forecast re-baseline: ${cls.label} settles at ${cls.medianRatio}× estimate`.slice(0, 180),
    question: [
      `Across ${cls.n} settled outcomes, ${cls.label} has a median actual÷forecast ratio of ${cls.medianRatio}× (exact two-sided sign test p=${cls.signP}; ${cls.confidence} evidence confidence).`,
      `The distribution-free ${Math.round(cls.band.coverageTarget * 100)}% band is ${cls.band.lowFactor}×–${cls.band.highFactor}× a recorded estimate, with finite-sample coverage bound ${cls.band.coverageBound} under exchangeability.`,
      `${candidates.length} open forecast(s) in this class have received an outside-view challenge inside the same transaction (RULE-FCI-01).`,
      `Triggered by ${ctx.event?.type || 'an outcome event'}. This decision governs the estimating PROCESS; it must not rewrite any recorded forecast. ${marker}`,
    ].join(' ').slice(0, 2000),
    date: ctx.todayStr,
    reversibility: 'reversible',
    driver: (draft.settings?.leaderName || '').slice(0, 120),
    approver: (draft.settings?.leaderName || '').slice(0, 120),
    contributors: candidates.slice(0, 3).map((c) => c.title).join(', ').slice(0, 300),
    informed: '',
    options: [
      {
        id: ctx.idFactory('dopt'),
        label: `Use ${cls.medianRatio}× as the planning central estimate for new ${cls.label} forecasts`,
        pros: `Anchors on ${cls.n} of the team's own settled outcomes (reference-class forecasting) rather than the inside view`,
        cons: 'A process change or a non-exchangeable new class can invalidate the historical median; review after the next five outcomes',
      },
      {
        id: ctx.idFactory('dopt'),
        label: `Reserve at the conformal upper bound (${cls.band.highFactor}×)`,
        pros: `Distribution-free ${Math.round(cls.band.coverageTarget * 100)}% band with finite-sample bound ${cls.band.coverageBound}; zero actuals remain representable`,
        cons: `Holds more ${unit} contingency against every forecast, including those that would have landed near the central estimate`,
      },
      {
        id: ctx.idFactory('dopt'),
        label: 'Investigate the estimation process before changing numbers',
        pros: report.coverage.rate !== null && report.coverage.rate < 0.6
          ? `Only ${Math.round(report.coverage.rate * 100)}% of settled outcomes landed inside recorded P10–P90 ranges; the ranges themselves may be the defect`
          : 'Finds the cause — decomposition, missing scope, vendor optimism — instead of only padding the symptom',
        cons: 'Slower; the next commitments are still made on uncorrected estimates',
      },
      {
        id: ctx.idFactory('dopt'),
        label: 'Accept the variance explicitly and keep the recorded estimates',
        pros: 'No process change; the risk is named and owned',
        cons: 'Future settlements will keep arriving as unplanned draws on money or capacity',
      },
    ],
    chosen: '',
    rationale: '',
    reviewOn: addDays(ctx.todayStr, draft.settings?.decisionReviewDays ?? 14),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    createdAt: ctx.nowIso,
  };
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);
  for (const candidate of candidates.slice(0, 8)) {
    ensureLink(draft, {
      sourceType: 'decision', sourceId: decision.id,
      targetType: candidate.sourceType, targetId: candidate.sourceId,
      relation: 'decides', ruleId: 'RULE-FCI-02',
      summary: `Governs the ${cls.label} outside-view challenges`,
    }, ctx);
  }
  return decision;
}

function measurementDelegation(draft, missing, ctx) {
  const marker = '[RULE-FCI-03]';
  const existing = (draft.delegations || []).find((d) => d.status === 'active' && String(d.support || '').includes(marker));
  if (existing) return null;
  const owner = (draft.people || []).find((p) => p.status !== 'archived');
  if (!owner) return null;
  const delegation = {
    id: ctx.idFactory('delegation'),
    personId: owner.id,
    title: `Recover ${Math.min(missing.length, 8)} missing forecast actual(s)`.slice(0, 160),
    expectedOutcome: `Record the real outcome for ${missing.length} resolved record(s): ${missing.slice(0, 4).map((m) => m.title).join(', ')}${missing.length > 4 ? '…' : ''}.`,
    authority: 'act-inform',
    support: `${marker} Blameless measurement recovery: a missing actual is not zero and cannot be inferred from the estimate. Record evidence only.`,
    delegatedOn: ctx.todayStr,
    dueOn: addDays(ctx.todayStr, 14),
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: ctx.nowIso,
    updatedAt: ctx.nowIso,
  };
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.push(delegation);
  return delegation;
}

/**
 * The single post-commit rule registered with the store. It is triggered by
 * adapter-declared outcome events (or an explicit forecast.scan), evaluates
 * the whole workspace, and fans out to challenges, graph links, DACI decisions
 * and a measurement-recovery delegation in one atomic transaction.
 */
export function forecastIntegrityRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event) return [];
  const declared = Array.isArray(event.rules) && event.rules.includes('forecastIntegrity');
  if (!declared && !FORECAST_OUTCOME_EVENTS.includes(event.type)) return [];
  // A pause stops outcome-driven writes, but an explicit user-initiated scan
  // is allowed to re-score and create challenges for the current evidence.
  if (draft.settings?.forecastAutoPropagate === false && event.force !== true) return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const context = {
    ...ctx,
    now,
    todayStr: dayKey(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
  };
  const report = forecastIntegrityReport(draft, now);
  const candidates = forecastChallengeCandidates(report, draft);
  const propagations = [];
  draft.forecastChallenges = Array.isArray(draft.forecastChallenges) ? draft.forecastChallenges : [];

  for (const candidate of candidates) {
    const existing = draft.forecastChallenges.find((c) => c.atomKey === candidate.atomKey);
    if (existing) {
      if (existing.status !== 'open') continue;
      if (existing.fingerprint === candidate.fingerprint) continue;
      const previous = {
        on: context.todayStr,
        action: 'refreshed',
        evidenceN: existing.evidenceN,
        medianRatio: existing.medianRatio,
        bandLow: existing.bandLow,
        bandHigh: existing.bandHigh,
      };
      Object.assign(existing, candidate, {
        status: 'open',
        responseNote: '',
        respondedOn: null,
        updatedAt: context.nowIso,
        history: [...(Array.isArray(existing.history) ? existing.history : []), previous].slice(-20),
      });
      propagations.push({ ruleId: 'RULE-FCI-01', action: 'refreshed', targetType: 'forecast', targetId: existing.id, summary: `Refreshed outside-view challenge for “${candidate.title}”` });
      if (context.logEvent) context.logEvent({ type: 'automation.propagated', entity: 'forecast', entityId: existing.id, summary: `[RULE-FCI-01] ${propagations.at(-1).summary}` });
      continue;
    }
    const challenge = {
      id: context.idFactory('fc'),
      ...candidate,
      status: 'open',
      responseNote: '',
      respondedOn: null,
      history: [],
      createdOn: context.todayStr,
      createdAt: context.nowIso,
      updatedAt: context.nowIso,
    };
    draft.forecastChallenges.push(challenge);
    ensureLink(draft, {
      sourceType: 'forecast', sourceId: challenge.id,
      targetType: candidate.sourceType, targetId: candidate.sourceId,
      relation: 'forecasts', ruleId: 'RULE-FCI-01',
      summary: `Outside-view challenge for ${candidate.quantityLabel} on “${candidate.title}”`,
    }, context);
    propagations.push({ ruleId: 'RULE-FCI-01', action: 'created', targetType: 'forecast', targetId: challenge.id, summary: `Created outside-view challenge for “${candidate.title}” (${candidate.bandLow}–${candidate.bandHigh} ${candidate.unit})` });
    if (context.logEvent) context.logEvent({ type: 'automation.propagated', entity: 'forecast', entityId: challenge.id, summary: `[RULE-FCI-01] ${propagations.at(-1).summary}` });
  }

  const createdByClass = new Map();
  for (const p of propagations) {
    if (p.action !== 'created') continue;
    const challenge = draft.forecastChallenges.find((c) => c.id === p.targetId);
    if (!challenge) continue;
    const list = createdByClass.get(challenge.classKey) || [];
    list.push(challenge);
    createdByClass.set(challenge.classKey, list);
  }
  const classLookup = new Map(report.classes.map((c) => [c.key, c]));
  if (report.globalClass) classLookup.set(report.globalClass.key, report.globalClass);
  for (const [classKey, createdChallenges] of createdByClass) {
    const cls = classLookup.get(classKey);
    const created = createdChallenges || [];
    if (!cls || !created.length) continue;
    const decision = decisionForClass(draft, cls, created, context, report);
    if (!decision) continue;
    propagations.push({ ruleId: 'RULE-FCI-02', action: 'created', targetType: 'decision', targetId: decision.id, summary: `Opened one DACI re-baseline decision for ${cls.label}` });
    if (context.logEvent) context.logEvent({ type: 'automation.propagated', entity: 'decision', entityId: decision.id, summary: `[RULE-FCI-02] ${propagations.at(-1).summary}` });
  }

  if (report.missingActuals.length >= 3) {
    const delegation = measurementDelegation(draft, report.missingActuals, context);
    if (delegation) {
      propagations.push({ ruleId: 'RULE-FCI-03', action: 'created', targetType: 'delegation', targetId: delegation.id, summary: `Opened one measurement-recovery delegation for ${report.missingActuals.length} missing actual(s)` });
      if (context.logEvent) context.logEvent({ type: 'automation.propagated', entity: 'delegation', entityId: delegation.id, summary: `[RULE-FCI-03] ${propagations.at(-1).summary}` });
    }
  }
  return propagations;
}

export function forecastRoutes() {
  return {
    list: '#/forecasts',
    classes: '#/forecasts?tab=classes',
    challenges: '#/forecasts?tab=challenges',
    brief: '#/forecasts?tab=brief',
  };
}

export { LEDGERS as FORECAST_LEDGERS, SOURCE_COLLECTION as FORECAST_SOURCE_COLLECTIONS };
