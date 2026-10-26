/**
 * app/core/domain/calibration.js — Forecast Calibration & Reference-Class
 * Learning.
 *
 * LeadOS predicts everywhere: PERT effort/value triples on plan items, Monte
 * Carlo P50/P80/P90 delivery dates, DACI decisions with scheduled outcome
 * reviews. Until now none of those predictions were ever scored against what
 * actually happened, so the same estimation errors repeated invisibly. This
 * module closes the loop with named, citable methods rather than vibes:
 *
 *  1. Probabilistic decision forecasts — Brier (1950) scores, a Murphy (1973)
 *     reliability/resolution/uncertainty decomposition and a reliability
 *     (calibration-curve) diagram, as operationalised by Tetlock & Gardner's
 *     Superforecasting (2015): when a call is made the leader records
 *     "P(this works out well)" and the scheduled outcome review
 *     (good / mixed / bad → 1 / 0.5 / 0) scores it. Cromwell's rule applies:
 *     forecasts are clamped to 5–95% because 0% and 100% are not probabilities
 *     a honest forecaster can defend, and a single miss at 100% would swamp
 *     the score.
 *  2. Effort-estimate calibration — Kahneman & Tversky's planning fallacy
 *     (1979) measured directly on the team's own record: actual ÷ PERT-expected
 *     ratios over delivered work, plus interval-coverage checks (did the
 *     actual land inside [optimistic, pessimistic] and P10–P90?) that expose
 *     overconfident ranges. The forecast being scored is the one frozen at
 *     funding time (RULE-FCT-01), so later estimate edits cannot rewrite
 *     history; pre-v21 history falls back to the current triple and is
 *     labelled as such.
 *  3. Reference-class forecasting (Flyvbjerg, 2006): the observed ratio
 *     distribution becomes an uplift factor for new commitments — the team's
 *     own delivery history is the outside view, replacing both naïve optimism
 *     and arbitrary padding.
 *
 * Pure module: no DOM, no storage, no wall-clock globals. Nothing is
 * fabricated: delivered items without recorded actuals are counted as missing
 * (never back-filled from the estimate), and every verdict refuses to render
 * below a minimum sample size rather than dressing an anecdote as a statistic.
 */

import { daysBetween, round } from '../time.js';
import { pertTriple } from './capacity.js';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Cromwell's rule: no honest operational forecast is 0% or 100%. */
export const FORECAST_MIN_PCT = 5;
export const FORECAST_MAX_PCT = 95;

/** Outcome review → scored value. `mixed` is the honest middle, not a miss. */
export const OUTCOME_VALUES = { good: 1, mixed: 0.5, bad: 0 };

/** Below this many scored pairs, descriptive counts are shown but no verdict. */
export const CALIBRATION_MIN_SAMPLES = 5;
/** Below this, not even a descriptive reference-class hint is offered. */
export const CALIBRATION_HINT_SAMPLES = 3;

/** Median actual/expected at or above this is systematic optimism. */
export const OPTIMISM_RATIO_THRESHOLD = 1.25;
/** Median actual/expected at or below this is systematic padding. */
export const PESSIMISM_RATIO_THRESHOLD = 0.8;
/** Actuals should land in [optimistic, pessimistic] almost always; below 60% the ranges are fiction. */
export const INTERVAL_COVERAGE_FLOOR = 0.6;
/** Mean decision forecast minus observed success, in percentage points. */
export const DECISION_BIAS_VERDICT_PP = 10;
export const DECISION_BIAS_SIGNAL_PP = 15;

const Z_80 = 0.8416212335729143; // Standard normal 80th percentile
const CURVE_BINS = 5; // Quintiles: honest resolution for small samples

function num(value, fallback = null) {
  // Number(null) is 0, which would silently turn "no forecast recorded" into
  // a scored 0% forecast. Missing stays missing.
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function round4(n) {
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : null;
}

/** Normalise a user-supplied forecast percent to an integer in [5, 95], or null. */
export function normalizeForecastPercent(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(FORECAST_MAX_PCT, Math.max(FORECAST_MIN_PCT, Math.round(n)));
}

function median(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Type-7 linear-interpolation quantile over an ascending-sorted array. */
function quantile(sorted, q) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] !== undefined ? sorted[base + 1] : sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

/* ------------------------------------------------------------------ */
/* Forecast snapshots (RULE-FCT-01 writes these at funding time)       */
/* ------------------------------------------------------------------ */

/**
 * Freeze what was believed when work was funded: the PERT effort distribution,
 * the expected value and the target date. Scoring later compares actuals
 * against this frozen belief, not against whatever the estimate was edited
 * into after the fact — the single most important anti-hindsight rule in
 * forecast evaluation (Tetlock, 2005: score the forecast that was made).
 *
 * Returns null when the item carries no measured effort estimate: an
 * unestimated item has no forecast to freeze and none is invented for it.
 */
export function buildForecastSnapshot(item, fundedOn) {
  if (!item) return null;
  const effort = pertTriple(item.effortDays);
  if (!effort.measured || effort.expected <= 0) return null;
  const value = pertTriple(item.value);
  return {
    fundedOn: fundedOn || null,
    targetOn: item.targetOn || null,
    effortOptimistic: effort.optimistic,
    effortMostLikely: effort.mostLikely,
    effortPessimistic: effort.pessimistic,
    effortExpected: effort.expected,
    effortStdDev: effort.stdDev,
    effortP10: effort.p10,
    effortP80: round2(effort.expected + Z_80 * effort.stdDev),
    effortP90: effort.p90,
    valueExpected: value.measured ? value.expected : null,
    currency: item.currency || 'USD',
  };
}

/** Effort distribution to score an item against: frozen snapshot first. */
function scoredEffort(item) {
  const snap = item.forecastSnapshot;
  if (snap && num(snap.effortExpected) > 0) {
    return {
      source: 'snapshot',
      optimistic: num(snap.effortOptimistic, 0),
      pessimistic: num(snap.effortPessimistic, 0),
      expected: num(snap.effortExpected, 0),
      p10: num(snap.effortP10, 0),
      p90: num(snap.effortP90, 0),
      targetOn: snap.targetOn || item.targetOn || null,
    };
  }
  const live = pertTriple(item.effortDays);
  if (!live.measured || live.expected <= 0) return null;
  return {
    source: 'current-estimate',
    optimistic: live.optimistic,
    pessimistic: live.pessimistic,
    expected: live.expected,
    p10: live.p10,
    p90: live.p90,
    targetOn: item.targetOn || null,
  };
}

function isScorablePortfolioItem(item) {
  // Capacity reserves are incident diversion estimated from a case's PERT
  // financials; their "actual" is the case outcome, which is a separate
  // ledger (planned, RESEARCH §41). Scoring them here would double-count.
  return item && item.kind !== 'capacity-reserve';
}

/* ------------------------------------------------------------------ */
/* Decision forecast calibration (Brier / Murphy / reliability curve)  */
/* ------------------------------------------------------------------ */

/**
 * Reviewed decisions that carried a forecast when the call was made:
 * { decisionId, title, date, reviewedOn, p, outcome, o, brier }.
 */
export function decisionForecastPairs(state) {
  const pairs = [];
  for (const d of state.decisions || []) {
    if (!d.chosen || !d.reviewedOn) continue;
    const p = num(d.forecastProbability);
    if (p === null) continue;
    const o = OUTCOME_VALUES[d.outcome];
    if (o === undefined) continue;
    const p01 = p / 100;
    pairs.push({
      decisionId: d.id,
      title: d.title,
      date: d.date || null,
      reviewedOn: d.reviewedOn,
      p: round4(p01),
      outcome: d.outcome,
      o,
      brier: round4((p01 - o) ** 2),
    });
  }
  return pairs.sort((a, b) => String(a.reviewedOn).localeCompare(String(b.reviewedOn)));
}

/** Mean Brier score; 0 is perfect, 0.25 is "always said 50%" on binary calls. */
export function brierScore(pairs) {
  if (!pairs.length) return null;
  return round4(pairs.reduce((sum, pair) => sum + (pair.p - pair.o) ** 2, 0) / pairs.length);
}

function binIndex(p) {
  return Math.min(CURVE_BINS - 1, Math.max(0, Math.floor(p * CURVE_BINS)));
}

/** Reliability-diagram data: forecast quintile vs observed success rate. */
export function calibrationCurve(pairs) {
  const bins = Array.from({ length: CURVE_BINS }, (_, i) => ({
    lo: round2(i / CURVE_BINS),
    hi: round2((i + 1) / CURVE_BINS),
    count: 0,
    meanForecast: null,
    observedRate: null,
  }));
  const sums = bins.map(() => ({ f: 0, o: 0 }));
  for (const pair of pairs) {
    const idx = binIndex(pair.p);
    bins[idx].count += 1;
    sums[idx].f += pair.p;
    sums[idx].o += pair.o;
  }
  bins.forEach((bin, i) => {
    if (bin.count > 0) {
      bin.meanForecast = round4(sums[i].f / bin.count);
      bin.observedRate = round4(sums[i].o / bin.count);
    }
  });
  return bins;
}

/**
 * Murphy (1973) decomposition over the same quintile bins as the curve:
 * BS ≈ REL − RES + UNC. Reliability measures calibration-in-the-small
 * (lower is better), resolution measures how much the forecasts discriminate
 * (higher is better), uncertainty is the base-rate variance no forecaster
 * controls. With fractional (0.5) outcomes and within-bin forecast spread
 * the identity is approximate, so the residual is reported instead of
 * hidden.
 */
export function murphyDecomposition(pairs) {
  const n = pairs.length;
  if (!n) return { reliability: null, resolution: null, uncertainty: null, residual: null, brier: null };
  const baseRate = pairs.reduce((s, p) => s + p.o, 0) / n;
  const bins = new Map();
  for (const pair of pairs) {
    const idx = binIndex(pair.p);
    if (!bins.has(idx)) bins.set(idx, []);
    bins.get(idx).push(pair);
  }
  let reliability = 0;
  let resolution = 0;
  for (const group of bins.values()) {
    const w = group.length / n;
    const meanF = group.reduce((s, p) => s + p.p, 0) / group.length;
    const meanO = group.reduce((s, p) => s + p.o, 0) / group.length;
    reliability += w * (meanF - meanO) ** 2;
    resolution += w * (meanO - baseRate) ** 2;
  }
  const uncertainty = pairs.reduce((s, p) => s + (p.o - baseRate) ** 2, 0) / n;
  const brier = pairs.reduce((s, p) => s + (p.p - p.o) ** 2, 0) / n;
  return {
    reliability: round4(reliability),
    resolution: round4(resolution),
    uncertainty: round4(uncertainty),
    residual: round4(brier - (reliability - resolution + uncertainty)),
    brier: round4(brier),
  };
}

function brierBand(bs) {
  if (bs === null) return null;
  if (bs <= 0.08) return { id: 'excellent', label: 'Excellent — superforecaster territory' };
  if (bs <= 0.15) return { id: 'good', label: 'Good — forecasts carry real information' };
  if (bs <= 0.25) return { id: 'fair', label: 'Fair — little better than always saying 50%' };
  return { id: 'poor', label: 'Poor — worse than a coin-flip baseline; revisit how forecasts are formed' };
}

/** One-call decision-forecast calibration read for views and signals. */
export function decisionCalibration(state) {
  const pairs = decisionForecastPairs(state);
  const n = pairs.length;
  const reviewedTotal = (state.decisions || []).filter((d) => d.chosen && d.reviewedOn).length;
  const pendingForecasts = (state.decisions || []).filter(
    (d) => d.chosen && !d.reviewedOn && num(d.forecastProbability) !== null,
  ).length;

  if (!n) {
    return {
      pairs,
      n,
      reviewedTotal,
      pendingForecasts,
      sufficient: false,
      brier: null,
      brierBand: null,
      brierSkill: null,
      meanForecast: null,
      observedRate: null,
      biasPp: null,
      curve: calibrationCurve(pairs),
      murphy: murphyDecomposition(pairs),
      verdict: {
        id: 'no-evidence',
        label: 'No scored forecasts yet',
        detail: reviewedTotal
          ? `${reviewedTotal} decision(s) have been reviewed, but none recorded a forecast when the call was made, so there is nothing honest to score. Add a forecast in the Decide dialog and the review will score it.`
          : 'Record a probability when you decide (“how likely is this to work out well?”) and the outcome review will score it. Calibration is the fastest known way to get better at judgement calls (Tetlock & Gardner, 2015).',
      },
    };
  }

  const brier = brierScore(pairs);
  const meanForecast = round4(pairs.reduce((s, p) => s + p.p, 0) / n);
  const observedRate = round4(pairs.reduce((s, p) => s + p.o, 0) / n);
  const biasPp = round((meanForecast - observedRate) * 100, 1);
  const climatology = pairs.reduce((s, p) => s + (observedRate - p.o) ** 2, 0) / n;
  const brierSkill = climatology > 0 ? round4(1 - brier / climatology) : null;
  const sufficient = n >= CALIBRATION_MIN_SAMPLES;

  let verdict;
  if (!sufficient) {
    verdict = {
      id: 'collecting',
      label: `Collecting evidence (${n} of ${CALIBRATION_MIN_SAMPLES})`,
      detail: `Brier ${brier} over ${n} scored forecast(s) is an anecdote, not a measurement. Keep forecasting; a verdict renders at ${CALIBRATION_MIN_SAMPLES}.`,
    };
  } else if (biasPp > DECISION_BIAS_VERDICT_PP) {
    verdict = {
      id: 'overconfident',
      label: 'Systematically overconfident',
      detail: `You forecast ${Math.round(meanForecast * 100)}% success on average; outcomes ran ${Math.round(observedRate * 100)}% (+${biasPp}pp optimism). Shave new forecasts toward the base rate until the curve hugs the diagonal.`,
    };
  } else if (biasPp < -DECISION_BIAS_VERDICT_PP) {
    verdict = {
      id: 'underconfident',
      label: 'Systematically underconfident',
      detail: `You forecast ${Math.round(meanForecast * 100)}% success on average; outcomes ran ${Math.round(observedRate * 100)}% (${biasPp}pp). Excess caution also costs: reversible calls are being made slower than their track record justifies.`,
    };
  } else {
    verdict = {
      id: 'well-calibrated',
      label: 'Well calibrated',
      detail: `Average forecast ${Math.round(meanForecast * 100)}% vs observed ${Math.round(observedRate * 100)}% across ${n} scored decisions. When this record says 70%, it means roughly 70%.`,
    };
  }

  return {
    pairs,
    n,
    reviewedTotal,
    pendingForecasts,
    sufficient,
    brier,
    brierBand: brierBand(brier),
    brierSkill,
    meanForecast,
    observedRate,
    biasPp,
    curve: calibrationCurve(pairs),
    murphy: murphyDecomposition(pairs),
    verdict,
  };
}

/* ------------------------------------------------------------------ */
/* Effort-estimate calibration & reference-class uplift                */
/* ------------------------------------------------------------------ */

/**
 * Delivered, non-reserve plan items with both a scorable estimate and a
 * recorded actual effort: the planning-fallacy evidence base.
 */
export function estimatePairs(state) {
  const pairs = [];
  for (const item of state.portfolio || []) {
    if (!isScorablePortfolioItem(item) || item.status !== 'done') continue;
    const actual = num(item.actualEffortDays);
    if (actual === null || actual < 0) continue;
    const effort = scoredEffort(item);
    if (!effort) continue;
    pairs.push({
      itemId: item.id,
      title: item.title,
      completedOn: item.completedOn || null,
      source: effort.source,
      expected: effort.expected,
      optimistic: effort.optimistic,
      pessimistic: effort.pessimistic,
      p10: effort.p10,
      p90: effort.p90,
      actual: round2(actual),
      ratio: round4(actual / effort.expected),
      withinRange: actual >= effort.optimistic && actual <= effort.pessimistic,
      withinP10P90: actual >= effort.p10 && actual <= effort.p90,
      actualValue: num(item.actualValue),
      valueExpected: item.forecastSnapshot ? num(item.forecastSnapshot.valueExpected) : null,
      currency: item.currency || 'USD',
    });
  }
  return pairs.sort((a, b) => String(a.completedOn || '').localeCompare(String(b.completedOn || '')));
}

/** Delivered items whose actual effort was never recorded — the loop is unfed. */
export function missingActualItems(state) {
  const missing = [];
  for (const item of state.portfolio || []) {
    if (!isScorablePortfolioItem(item) || item.status !== 'done') continue;
    if (num(item.actualEffortDays) !== null) continue;
    const effort = scoredEffort(item);
    if (!effort) continue;
    missing.push({
      itemId: item.id,
      title: item.title,
      completedOn: item.completedOn || null,
      expected: effort.expected,
    });
  }
  return missing.sort((a, b) => String(b.completedOn || '').localeCompare(String(a.completedOn || '')));
}

/** Schedule adherence from dates alone — available even without effort actuals. */
export function scheduleAdherence(state) {
  const slips = [];
  for (const item of state.portfolio || []) {
    if (!isScorablePortfolioItem(item) || item.status !== 'done' || !item.completedOn) continue;
    const effort = scoredEffort(item);
    const targetOn = effort?.targetOn || null;
    if (!targetOn) continue;
    const slip = daysBetween(targetOn, item.completedOn);
    if (slip === null || slip === undefined || Number.isNaN(slip)) continue;
    slips.push(slip);
  }
  if (!slips.length) {
    return { n: 0, onTimeRate: null, medianSlipDays: null, lateCount: 0 };
  }
  const sorted = slips.slice().sort((a, b) => a - b);
  return {
    n: slips.length,
    onTimeRate: round4(slips.filter((s) => s <= 0).length / slips.length),
    medianSlipDays: round(median(sorted), 1),
    lateCount: slips.filter((s) => s > 0).length,
  };
}

/** One-call estimate calibration read: bias, interval honesty, uplift. */
export function estimateCalibration(state) {
  const pairs = estimatePairs(state);
  const missing = missingActualItems(state);
  const schedule = scheduleAdherence(state);
  const n = pairs.length;

  const ratios = pairs.map((p) => p.ratio).slice().sort((a, b) => a - b);
  const medianRatio = n ? round4(median(ratios)) : null;
  const meanRatio = n ? round4(ratios.reduce((s, r) => s + r, 0) / n) : null;
  const ratioP80 = n ? round4(quantile(ratios, 0.8)) : null;
  const withinRangeRate = n ? round4(pairs.filter((p) => p.withinRange).length / n) : null;
  const withinP10P90Rate = n ? round4(pairs.filter((p) => p.withinP10P90).length / n) : null;
  const sufficient = n >= CALIBRATION_MIN_SAMPLES;
  const hintReady = n >= CALIBRATION_HINT_SAMPLES;

  let verdict;
  if (!n) {
    verdict = {
      id: 'no-evidence',
      label: 'No scored estimates yet',
      detail: missing.length
        ? `${missing.length} item(s) were delivered without recording actual effort, so estimate quality is unknown — not good, unknown. Record actuals at delivery and the planning fallacy becomes measurable.`
        : 'Deliver funded work and record the actual person-days it took. Three scored items produce a first reference-class hint; five produce a verdict.',
    };
  } else if (!sufficient) {
    verdict = {
      id: 'collecting',
      label: `Collecting evidence (${n} of ${CALIBRATION_MIN_SAMPLES})`,
      detail: `Median actual/estimate so far is ${medianRatio}×, but ${n} item(s) is an anecdote. A verdict renders at ${CALIBRATION_MIN_SAMPLES}.`,
    };
  } else if (medianRatio >= OPTIMISM_RATIO_THRESHOLD) {
    verdict = {
      id: 'optimistic',
      label: 'Estimates are systematically optimistic',
      detail: `Delivered work ran a median ${medianRatio}× its PERT expectation (n=${n}). This is the planning fallacy in your own data: multiply new point estimates by ${medianRatio}× (or plan to the P80 uplift of ${ratioP80}×) until the ratio recentres (Flyvbjerg, 2006).`,
    };
  } else if (medianRatio <= PESSIMISM_RATIO_THRESHOLD) {
    verdict = {
      id: 'padded',
      label: 'Estimates are systematically padded',
      detail: `Delivered work ran a median ${medianRatio}× its PERT expectation (n=${n}). Padding feels safe but quietly rations ambition: the plan funds less than the team can actually do.`,
    };
  } else {
    verdict = {
      id: 'centred',
      label: 'Estimates are centred',
      detail: `Median actual/estimate is ${medianRatio}× across ${n} delivered items — estimates are honest on average. Watch the interval coverage below; centring and precision are different virtues.`,
    };
  }

  const intervalVerdict = !sufficient
    ? null
    : withinRangeRate < INTERVAL_COVERAGE_FLOOR
      ? {
          id: 'intervals-too-narrow',
          label: 'Estimate ranges are too narrow',
          detail: `Only ${Math.round(withinRangeRate * 100)}% of actuals landed inside the optimistic–pessimistic range (n=${n}); a range that misses ${Math.round((1 - withinRangeRate) * 100)}% of the time is decoration. Widen the pessimistic leg — that is where the surprises live.`,
        }
      : {
          id: 'intervals-honest',
          label: 'Estimate ranges are honest',
          detail: `${Math.round(withinRangeRate * 100)}% of actuals landed inside the optimistic–pessimistic range and ${Math.round(withinP10P90Rate * 100)}% inside P10–P90 (target ≈80%).`,
        };

  return {
    pairs,
    missingActuals: missing.length,
    missingItems: missing,
    schedule,
    n,
    sufficient,
    hintReady,
    medianRatio,
    meanRatio,
    ratioP80,
    withinRangeRate,
    withinP10P90Rate,
    verdict,
    intervalVerdict,
  };
}

/**
 * Flyvbjerg reference-class adjustment for a new effort expectation:
 * median uplift recentres the point estimate; the P80 ratio uplift gives
 * the "budget this if you want an 80% chance of holding the date" figure.
 * Returns null below the hint sample floor — a factor from two items would
 * be a superstition with a decimal point.
 */
export function referenceClassAdjustment(expectedDays, estCal) {
  const expected = num(expectedDays);
  if (expected === null || expected <= 0 || !estCal?.hintReady || !estCal.medianRatio) return null;
  return {
    n: estCal.n,
    factor: estCal.medianRatio,
    upliftP80Factor: estCal.ratioP80,
    adjustedDays: round2(expected * estCal.medianRatio),
    adjustedP80Days: estCal.ratioP80 ? round2(expected * estCal.ratioP80) : null,
  };
}

/** Everything the Decisions view, Capacity view and signal engine need. */
export function calibrationSummary(state) {
  const decisions = decisionCalibration(state);
  const estimates = estimateCalibration(state);
  return {
    decisions,
    estimates,
    anySufficient: decisions.sufficient || estimates.sufficient,
    anyEvidence: decisions.n > 0 || estimates.n > 0 || decisions.pendingForecasts > 0,
  };
}
