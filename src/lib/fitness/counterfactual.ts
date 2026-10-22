// LEADOS — Part 39: counterfactual fitness estimation — "what would fitness
// have been without this intervention?"
//
// HONESTY CAVEAT (declared proxy, not causal certainty): this is a stand-in
// for Part 05's estimator library (not physically present in this sandbox
// instance). The method implemented here is a pre-period linear-trend
// extrapolation (ordinary least squares on the pre-intervention window,
// projected forward). This is the simplest defensible counterfactual and is
// clearly inferior to a true synthetic-control or diff-in-diff estimator with
// a control group — it assumes the pre-existing trend would have continued
// unchanged. It is reported with this caveat attached every time, never as
// unqualified truth.

export interface TimePoint {
  t: number; // period index, 0, 1, 2, ...
  value: number;
}

export interface CounterfactualResult {
  method: "pre_period_linear_trend";
  caveat: string;
  slope: number;
  intercept: number;
  counterfactualSeries: TimePoint[];
  actualSeries: TimePoint[];
  /** actual - counterfactual, averaged over the post-intervention window. */
  estimatedEffect: number;
  /** estimatedEffect as a share of the counterfactual mean, for readability. */
  estimatedEffectPct: number;
}

const CAVEAT =
  "Declared proxy, not ground truth: this counterfactual assumes the pre-intervention linear trend would have continued unchanged. It does not control for confounding events. Treat as directional evidence, not proof of causal impact.";

/** Ordinary least squares fit of value ~ t over the given points. */
export function fitLinearTrend(points: TimePoint[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: points[0].value };

  const meanT = points.reduce((s, p) => s + p.t, 0) / n;
  const meanV = points.reduce((s, p) => s + p.value, 0) / n;

  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - meanT) * (p.value - meanV);
    den += (p.t - meanT) * (p.t - meanT);
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanV - slope * meanT;
  return { slope, intercept };
}

/**
 * Estimate the counterfactual series over the post-intervention window using
 * the pre-intervention trend, and compare to what actually happened.
 */
export function estimateCounterfactual(
  preIntervention: TimePoint[],
  postIntervention: TimePoint[],
): CounterfactualResult {
  const { slope, intercept } = fitLinearTrend(preIntervention);

  const counterfactualSeries: TimePoint[] = postIntervention.map((p) => ({
    t: p.t,
    value: intercept + slope * p.t,
  }));

  const meanActual = postIntervention.length
    ? postIntervention.reduce((s, p) => s + p.value, 0) / postIntervention.length
    : 0;
  const meanCounterfactual = counterfactualSeries.length
    ? counterfactualSeries.reduce((s, p) => s + p.value, 0) / counterfactualSeries.length
    : 0;

  const estimatedEffect = meanActual - meanCounterfactual;
  const estimatedEffectPct = meanCounterfactual !== 0 ? (estimatedEffect / Math.abs(meanCounterfactual)) * 100 : 0;

  return {
    method: "pre_period_linear_trend",
    caveat: CAVEAT,
    slope,
    intercept,
    counterfactualSeries,
    actualSeries: postIntervention,
    estimatedEffect,
    estimatedEffectPct,
  };
}

/**
 * Ground-truth harness for Part 05-style validation: generate synthetic data
 * with a KNOWN pre-period slope and a KNOWN injected post-period effect, run
 * the estimator, and report how close the recovered effect is to the truth.
 * Used by scripts/verify-fitness.ts (Phase 4 gate #5).
 */
export function groundTruthHarness(params: {
  preLength: number;
  postLength: number;
  trueSlope: number;
  trueIntercept: number;
  trueEffect: number;
  noise?: (t: number) => number; // deterministic "noise" injector for reproducibility
}): { recoveredEffect: number; trueEffect: number; absoluteError: number; withinTolerance: boolean } {
  const noise = params.noise ?? (() => 0);

  const pre: TimePoint[] = Array.from({ length: params.preLength }, (_, t) => ({
    t,
    value: params.trueIntercept + params.trueSlope * t + noise(t),
  }));

  const post: TimePoint[] = Array.from({ length: params.postLength }, (_, i) => {
    const t = params.preLength + i;
    return {
      t,
      value: params.trueIntercept + params.trueSlope * t + params.trueEffect + noise(t),
    };
  });

  const result = estimateCounterfactual(pre, post);
  const absoluteError = Math.abs(result.estimatedEffect - params.trueEffect);
  // Tolerance scales with the magnitude of injected noise; with zero noise this should be near-exact.
  const tolerance = Math.max(0.5, Math.abs(params.trueEffect) * 0.1);

  return {
    recoveredEffect: result.estimatedEffect,
    trueEffect: params.trueEffect,
    absoluteError,
    withinTolerance: absoluteError <= tolerance,
  };
}
