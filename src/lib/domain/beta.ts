/**
 * Beta-Bernoulli conjugate updating.
 *
 * Used across LEADOS to track confidence in binary signals (e.g. "did this
 * finding convert into a validated decision?") as a probability
 * distribution rather than a point estimate.
 */

export interface BetaState {
  readonly alpha: number;
  readonly beta: number;
}

/** A fresh, uninformative prior. Beta(1,1) == Uniform(0,1). */
export function priorBeta(alpha = 1, beta = 1): BetaState {
  if (alpha <= 0 || beta <= 0) {
    throw new Error("Beta prior parameters must be > 0");
  }
  return { alpha, beta };
}

/** Bayesian update after observing a single Bernoulli outcome. */
export function updateBeta(state: BetaState, success: boolean): BetaState {
  return success
    ? { alpha: state.alpha + 1, beta: state.beta }
    : { alpha: state.alpha, beta: state.beta + 1 };
}

/** Batch update — order-independent (addition is commutative). */
export function updateBetaBatch(
  state: BetaState,
  outcomes: readonly boolean[],
): BetaState {
  const successes = outcomes.filter(Boolean).length;
  const failures = outcomes.length - successes;
  return {
    alpha: state.alpha + successes,
    beta: state.beta + failures,
  };
}

export function meanBeta(state: BetaState): number {
  return state.alpha / (state.alpha + state.beta);
}

export function varianceBeta(state: BetaState): number {
  const { alpha, beta } = state;
  const sum = alpha + beta;
  return (alpha * beta) / (sum * sum * (sum + 1));
}

/** Total pseudo-observations absorbed into this state (prior + data). */
export function totalCount(state: BetaState): number {
  return state.alpha + state.beta;
}

/**
 * Approximate equal-tailed credible interval using the Wilson–Hilferty / 
 * normal approximation to the Beta distribution. Good enough for
 * dashboards; not a substitute for exact quantile functions when
 * alpha/beta are tiny (<1 after the uniform prior, which cannot happen
 * via updateBeta since it only adds whole counts).
 */
export function credibleInterval(
  state: BetaState,
  confidence = 0.95,
): { lower: number; upper: number } {
  const mean = meanBeta(state);
  const sd = Math.sqrt(varianceBeta(state));
  const z = confidence >= 0.99 ? 2.5758 : confidence >= 0.95 ? 1.95996 : 1.6449;
  return {
    lower: Math.max(0, mean - z * sd),
    upper: Math.min(1, mean + z * sd),
  };
}
