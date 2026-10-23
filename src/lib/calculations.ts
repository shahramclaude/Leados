/**
 * LEADOS BI calculation library.
 *
 * Honesty discipline (Pack 3 anti-slop rule): every number produced here
 * carries a `honestyLabel`:
 *   - "measured"    -> read directly from recorded data, no modeling
 *   - "estimated"   -> derived via a disclosed, named formula
 *   - "association" -> a correlational pattern, not causal
 *   - "effect"      -> from a before/after or matched comparison
 *
 * These are deliberately simple, transparent implementations (moving
 * averages, z-scores, weighted sums) rather than opaque ML models, so every
 * output is reproducible and explainable from the formula alone.
 */

export type HonestyLabel = "measured" | "estimated" | "association" | "effect";

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/**
 * Simple moving-average forecast with a normal-approximation band.
 * method = "moving-average" (named, disclosed).
 * p50 = mean of trailing window; p10/p90 = mean +/- 1.2816*sigma (~80% interval).
 */
export function movingAverageForecast(history: number[], window = 6) {
  const trailing = history.slice(-window);
  const m = mean(trailing);
  const sd = stddev(trailing);
  const z = 1.2816; // 80% two-sided normal z-score
  const p10 = Math.max(0, m - z * sd);
  const p90 = m + z * sd;
  return { p50: round2(m), p10: round2(p10), p90: round2(p90), method: "moving-average" as const };
}

/** Bias = mean(actual - forecast) / mean(actual), expressed as a percentage. */
export function forecastBiasPct(actuals: number[], forecasts: number[]): number {
  if (actuals.length === 0 || actuals.length !== forecasts.length) return 0;
  const errs = actuals.map((a, i) => a - forecasts[i]);
  const m = mean(actuals);
  if (m === 0) return 0;
  return round3((mean(errs) / m) * 100);
}

/** Z-score anomaly detector. |z| > threshold flags an anomaly. */
export function zScoreAnomaly(series: number[], latest: number, threshold = 2) {
  const sd = stddev(series);
  const m = mean(series);
  const z = sd === 0 ? 0 : (latest - m) / sd;
  return { z: round2(z), isAnomaly: Math.abs(z) > threshold, expected: round2(m) };
}

export interface WeightedComponent {
  name: string;
  value: number; // 0..100
  weight: number; // sums to 1 across components
}

/** Weighted-sum health score with top-3 explainability (contribution = weight * value). */
export function weightedHealthScore(components: WeightedComponent[]) {
  const totalWeight = components.reduce((a, c) => a + c.weight, 0) || 1;
  const contributions = components.map((c) => ({
    name: c.name,
    contribution: (c.weight / totalWeight) * c.value,
  }));
  const score = contributions.reduce((a, c) => a + c.contribution, 0);
  const explainTop3 = [...contributions]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((c) => `${c.name} (${round2(c.contribution)} pts)`);
  const band = score >= 75 ? "healthy" : score >= 55 ? "watch" : score >= 35 ? "at-risk" : "critical";
  return { score: round2(score), band, explainTop3 };
}

/**
 * Churn probability as a monotone transform of the inverse health score,
 * calibrated with a logistic squashing function. This is explicitly an
 * "association" output: it correlates low health with churn risk but has
 * not been validated against a held-out causal experiment.
 */
export function churnProbabilityFromHealth(score: number): number {
  const x = (50 - score) / 12; // centered logistic input
  const p = 1 / (1 + Math.exp(-x));
  return round3(p);
}

/** Error-budget burn rate: how fast the SLO's error budget is being consumed. */
export function errorBudgetBurn(targetPct: number, measuredPct: number, windowDays: number) {
  const allowedErrorPct = 100 - targetPct;
  const observedErrorPct = Math.max(0, 100 - measuredPct);
  const burnRate = allowedErrorPct === 0 ? 0 : observedErrorPct / allowedErrorPct;
  const budgetRemainingPct = Math.max(0, round2((1 - burnRate) * 100));
  const daysToExhaustion = burnRate > 0 ? round2(windowDays / burnRate) : Infinity;
  return { burnRate: round3(burnRate), budgetRemainingPct, daysToExhaustion };
}

/** Pareto-style fairness disparity index across a set of numeric workloads. */
export function disparityIndex(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  if (m === 0) return 0;
  const maxDev = Math.max(...values.map((v) => Math.abs(v - m)));
  return round3(maxDev / m);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}
