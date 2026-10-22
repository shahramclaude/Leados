/**
 * PERT (Program Evaluation and Review Technique) three-point estimation.
 *
 * Used for effort/impact estimation on findings and decisions where a
 * single point estimate would hide uncertainty.
 */

export interface PertInputs {
  /** Optimistic estimate (best case). */
  readonly optimistic: number;
  /** Most likely estimate (mode). */
  readonly mostLikely: number;
  /** Pessimistic estimate (worst case). */
  readonly pessimistic: number;
}

export interface PertResult {
  readonly mean: number;
  readonly variance: number;
  readonly stdDev: number;
}

export function pertEstimate(inputs: PertInputs): PertResult {
  const { optimistic: o, mostLikely: m, pessimistic: p } = inputs;
  if (!(o <= m && m <= p)) {
    throw new Error(
      "PERT requires optimistic <= mostLikely <= pessimistic",
    );
  }
  const mean = (o + 4 * m + p) / 6;
  const stdDev = (p - o) / 6;
  const variance = stdDev * stdDev;
  return { mean, variance, stdDev };
}

/** 90% confidence bounds assuming the PERT Beta approximation is ~Normal. */
export function pertConfidenceBounds(
  inputs: PertInputs,
  zScore = 1.6449,
): { lower: number; upper: number } {
  const { mean, stdDev } = pertEstimate(inputs);
  return {
    lower: Math.max(inputs.optimistic, mean - zScore * stdDev),
    upper: Math.min(inputs.pessimistic, mean + zScore * stdDev),
  };
}
