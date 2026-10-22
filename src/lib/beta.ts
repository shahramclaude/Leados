// src/lib/beta.ts
//
// BetaBelief: the conjugate-prior representation used across the GRC stack
// for (a) risk likelihood beliefs and (b) control-effectiveness beliefs.
// A Beta(alpha, beta) distribution over a probability p is updated by simple
// counting: alpha += successes, beta += failures. This gives us a principled
// way to narrow uncertainty as control tests and loss events accumulate,
// and to keep the interval WIDE when evidence is thin (HONESTY RULE).

import { betaQuantile, regularizedIncompleteBeta } from "./stats";

export interface BetaBelief {
  alpha: number;
  beta: number;
  /** Free-text note on where the prior came from (expert elicitation, base rate, etc). */
  priorRationale?: string;
}

/** A neutral, high-uncertainty prior: Beta(1,1) = uniform(0,1). */
export function uninformativePrior(rationale = "Uninformative Beta(1,1) prior: no evidence yet"): BetaBelief {
  return { alpha: 1, beta: 1, priorRationale: rationale };
}

export function betaMean(b: BetaBelief): number {
  return b.alpha / (b.alpha + b.beta);
}

export function betaVariance(b: BetaBelief): number {
  const { alpha: a, beta: be } = b;
  return (a * be) / ((a + be) ** 2 * (a + be + 1));
}

/** Total "evidence weight" (pseudo-observations) behind the belief. */
export function betaEvidenceCount(b: BetaBelief): number {
  return b.alpha + b.beta - 2; // subtract the Beta(1,1) prior's 2 pseudo-counts
}

export interface CredibleInterval {
  low: number;
  high: number;
  level: number; // e.g. 0.9 for a 90% credible interval
}

/** Equal-tailed credible interval, e.g. level=0.9 -> [5th, 95th] percentile. */
export function betaCredibleInterval(b: BetaBelief, level = 0.9): CredibleInterval {
  const tail = (1 - level) / 2;
  return {
    low: betaQuantile(tail, b.alpha, b.beta),
    high: betaQuantile(1 - tail, b.alpha, b.beta),
    level,
  };
}

/** Width of the credible interval — our standard "how thin is the evidence" signal. */
export function betaIntervalWidth(b: BetaBelief, level = 0.9): number {
  const ci = betaCredibleInterval(b, level);
  return ci.high - ci.low;
}

export type BetaUpdateResult = "pass" | "fail";

/** Bayesian update on a single Bernoulli observation (test pass/fail, loss/no-loss). */
export function updateBeta(prior: BetaBelief, result: BetaUpdateResult, weight = 1): BetaBelief {
  return {
    alpha: prior.alpha + (result === "pass" ? weight : 0),
    beta: prior.beta + (result === "fail" ? weight : 0),
    priorRationale: prior.priorRationale,
  };
}

/** Probability mass below a threshold — useful for appetite-breach probability checks. */
export function betaCdf(b: BetaBelief, x: number): number {
  return regularizedIncompleteBeta(x, b.alpha, b.beta);
}

/** Human-readable evidence-strength label; never implies certainty. */
export function evidenceStrengthLabel(b: BetaBelief): "thin" | "moderate" | "strong" {
  const n = betaEvidenceCount(b);
  if (n < 5) return "thin";
  if (n < 20) return "moderate";
  return "strong";
}
