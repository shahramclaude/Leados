/**
 * Beta-Bernoulli belief updating engine.
 *
 * Models confidence in a finding as a Beta(alpha, beta) posterior over an
 * unknown success probability. Observing a success/failure is a conjugate
 * update: alpha += 1 (success) or beta += 1 (failure). This module is pure
 * and deterministic — no randomness, no wall-clock reads — so it can be
 * property tested exhaustively.
 */
export type BetaParams = {
  alpha: number;
  beta: number;
};

export function createBetaPrior(alpha = 1, beta = 1): BetaParams {
  if (alpha <= 0 || beta <= 0) {
    throw new Error("Beta prior parameters must be strictly positive");
  }
  return { alpha, beta };
}

/** Conjugate update after observing a single Bernoulli outcome. */
export function betaUpdate(params: BetaParams, outcome: 0 | 1): BetaParams {
  return outcome === 1
    ? { alpha: params.alpha + 1, beta: params.beta }
    : { alpha: params.alpha, beta: params.beta + 1 };
}

/** Batch update — order-independent by construction (addition is commutative). */
export function betaUpdateBatch(params: BetaParams, outcomes: readonly (0 | 1)[]): BetaParams {
  return outcomes.reduce((acc, o) => betaUpdate(acc, o), params);
}

export function betaMean(params: BetaParams): number {
  return params.alpha / (params.alpha + params.beta);
}

export function betaVariance(params: BetaParams): number {
  const { alpha, beta } = params;
  const sum = alpha + beta;
  return (alpha * beta) / (sum * sum * (sum + 1));
}

/**
 * Approximate central credible interval using the normal approximation to
 * the Beta distribution. Adequate for alpha+beta large enough (>= ~10); for
 * small sample sizes the interval is clamped to [0, 1].
 */
export function betaCredibleInterval(
  params: BetaParams,
  z = 1.96,
): { lower: number; upper: number } {
  const mean = betaMean(params);
  const sd = Math.sqrt(betaVariance(params));
  return {
    lower: Math.max(0, mean - z * sd),
    upper: Math.min(1, mean + z * sd),
  };
}
