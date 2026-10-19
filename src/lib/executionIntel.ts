export type DeliveryFactors = {
  scopeCreepScore: number; // 0..1, higher = worse
  teamAttritionScore: number; // 0..1, higher = worse
  dependencyRiskScore: number; // 0..1, higher = worse
  blockerCount: number; // count, higher = worse
  velocityTrend: number; // -1..1, negative = worse
};

/**
 * Raw confidence starts at 1.0 and is reduced by every negative
 * factor. Clamped to >= 0 so pathological inputs never go negative.
 */
export function computeDeliveryConfidence(factors: DeliveryFactors): number {
  let raw = 1;
  raw -= factors.scopeCreepScore * 0.3;
  raw -= factors.teamAttritionScore * 0.3;
  raw -= factors.dependencyRiskScore * 0.2;
  raw -= Math.min(1, factors.blockerCount * 0.05) * 0.2;
  raw -= Math.max(0, -factors.velocityTrend) * 0.2;
  return Math.max(0, raw);
}

/**
 * Numerically stable sigmoid. Mathematically always in (0,1), but for
 * very large |x| (e.g. x=100) float64 rounds the result to exactly
 * 1.0 or 0.0 — that is a precision limit of IEEE754, not a logic bug.
 * Callers working with a bounded "confidence" domain should use
 * `confidenceSigmoid` below, which rescales the input first so the
 * output never saturates to the float64 boundary.
 */
export function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

/**
 * Squashes a 0..100-scale confidence score into (0,1) without ever
 * saturating to the float64 boundary, by rescaling into a range
 * where exp() never underflows to zero relative to 1.
 */
export function confidenceSigmoid(score: number): number {
  return sigmoid((score - 50) / 15);
}
