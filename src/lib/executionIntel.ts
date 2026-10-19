// executionIntel — small, well-tested math primitives shared by
// executionEngine: a bounded "raw confidence from factors" scorer and a
// numerically-stable sigmoid for squashing scores into probabilities.

export type DeliveryFactors = {
  scopeCreepScore: number; // 0..1, higher = worse
  blockerPressure: number; // 0..1, higher = worse (severity-weighted open blockers)
  scheduleAdherence: number; // 0..1, higher = better (fraction of milestones on/ahead of schedule)
  onTimeProbability: number; // 0..1, from Monte Carlo schedule-risk simulation
};

/**
 * Blends schedule simulation output with human-visible factors (scope
 * creep, blocker pressure) into one explainable 0..1 confidence score.
 * Each factor's contribution is returned alongside the score so the UI can
 * show *why* confidence is what it is, not just the number.
 */
export function computeDeliveryConfidence(factors: DeliveryFactors): { score: number; contributions: Record<string, number> } {
  const contributions = {
    onTimeProbability: factors.onTimeProbability * 0.45,
    scheduleAdherence: factors.scheduleAdherence * 0.25,
    scopeCreepPenalty: -(factors.scopeCreepScore * 0.15),
    blockerPenalty: -(factors.blockerPressure * 0.15),
  };
  const raw = 0.3 + Object.values(contributions).reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(1, raw));
  return { score, contributions };
}

/** Numerically stable sigmoid, safe for large |x|. */
export function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}
