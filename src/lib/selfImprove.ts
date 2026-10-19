// src/lib/selfImprove.ts
//
// Shared rule self-calibration math. ruleEngine.ts (Brier-score audits) and
// agentCore.ts (hypothesis-resolution nudges) both import from here so
// there is a single source of truth for weight math + clamping.

export const WEIGHT_MIN = 0.1;
export const WEIGHT_MAX = 2.5;

/**
 * Brier score: mean squared error between predicted probability and the
 * realized binary outcome (0/1). Lower is better-calibrated.
 *   brierScore = (1/n) * sum((predicted_i - outcome_i)^2)
 */
export function computeBrierScore(samples: Array<{ predicted: number; outcome: boolean }>): number {
  if (samples.length === 0) return 0;
  const sumSquaredError = samples.reduce((acc, s) => {
    const actual = s.outcome ? 1 : 0;
    return acc + (s.predicted - actual) ** 2;
  }, 0);
  return sumSquaredError / samples.length;
}

export function clampWeight(weight: number, min = WEIGHT_MIN, max = WEIGHT_MAX): number {
  return Math.min(max, Math.max(min, weight));
}

/**
 * Bounded calibration nudge: multiplies the current weight by `factor`
 * (expected to be in [0.9, 1.1] per the ±10%-per-cycle constraint) and
 * clamps the result to [WEIGHT_MIN, WEIGHT_MAX]. Never allows a single call
 * to halve or double a weight.
 */
export function nudgeWeight(oldWeight: number, factor: number): number {
  const boundedFactor = Math.min(1.1, Math.max(0.9, factor));
  return clampWeight(oldWeight * boundedFactor);
}
