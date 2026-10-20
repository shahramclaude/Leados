// Bayesian belief updating for decisions, using the Beta-Binomial conjugate
// model: a decision's "confidence this option is right" belief is a Beta
// distribution; each piece of evidence (successes/failures) is a Binomial
// update that is conjugate, so the posterior is just parameter addition.

export interface BetaParams {
  alpha: number;
  beta: number;
}

export interface Evidence {
  successes: number;
  failures: number;
}

export function updateBeta(prior: BetaParams, evidence: Evidence): BetaParams {
  if (prior.alpha <= 0 || prior.beta <= 0) {
    throw new Error("prior alpha/beta must be positive");
  }
  if (evidence.successes < 0 || evidence.failures < 0) {
    throw new Error("evidence counts must not be negative");
  }
  return {
    alpha: prior.alpha + evidence.successes,
    beta: prior.beta + evidence.failures,
  };
}

export function betaMean(params: BetaParams): number {
  return params.alpha / (params.alpha + params.beta);
}

export function betaVariance(params: BetaParams): number {
  const { alpha, beta } = params;
  const sum = alpha + beta;
  return (alpha * beta) / (sum * sum * (sum + 1));
}

/** 1 std-dev credible-interval-ish band around the mean, clamped to [0, 1]. */
export function betaCredibleBand(params: BetaParams): { low: number; high: number } {
  const mean = betaMean(params);
  const sd = Math.sqrt(betaVariance(params));
  return {
    low: Math.max(0, mean - sd),
    high: Math.min(1, mean + sd),
  };
}
