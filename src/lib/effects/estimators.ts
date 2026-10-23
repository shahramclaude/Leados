/**
 * STAND-IN for Part 04 (conjugate Bayesian updates) + Part 05 (effect
 * estimators). Neither module existed in this repository snapshot (confirmed
 * via grep before writing this file). Part 51 needs a small, explicit
 * Beta-Bernoulli conjugate estimator with time-decay; this file implements
 * exactly that contract so it can be swapped for the real Part 04/05 modules
 * later without touching the ranking/belief-update call sites.
 */

import type { EvidenceClass } from "@/lib/recommender/types";

export interface BetaPosterior {
  alpha: number;
  beta: number;
}

/** Uninformative Beta(1,1) prior — "we know nothing yet". */
export const UNINFORMATIVE_PRIOR: BetaPosterior = { alpha: 1, beta: 1 };

/**
 * Beta-Bernoulli conjugate update (Part 04 conjugacy): observing `success`
 * with weight `magnitude` (default 1, allows partial-credit outcomes) moves
 * the posterior exactly as classic Bayesian updating prescribes.
 */
export function updatePosterior(
  prior: BetaPosterior,
  success: boolean,
  magnitude = 1,
): BetaPosterior {
  const w = Math.max(0, Math.min(1, magnitude)) || 0.01;
  return success
    ? { alpha: prior.alpha + w, beta: prior.beta }
    : { alpha: prior.alpha, beta: prior.beta + w };
}

/**
 * Exponential decay of accumulated evidence back toward the uninformative
 * prior as it ages without reinforcement. `halfLifeDays` controls how fast
 * unverified / unrefreshed beliefs lose confidence — this is what keeps the
 * recommender honest about stale evidence (Phase 3d / Gate 5).
 */
export function decayPosterior(
  posterior: BetaPosterior,
  daysSinceUpdate: number,
  halfLifeDays: number,
): BetaPosterior {
  if (daysSinceUpdate <= 0) return posterior;
  const decayFactor = Math.pow(0.5, daysSinceUpdate / Math.max(1, halfLifeDays));
  return {
    alpha: UNINFORMATIVE_PRIOR.alpha + (posterior.alpha - UNINFORMATIVE_PRIOR.alpha) * decayFactor,
    beta: UNINFORMATIVE_PRIOR.beta + (posterior.beta - UNINFORMATIVE_PRIOR.beta) * decayFactor,
  };
}

export function posteriorMean(p: BetaPosterior): number {
  return p.alpha / (p.alpha + p.beta);
}

/**
 * Approximate credible interval using a normal approximation to the Beta
 * distribution (mean +/- z * sd), clamped to [0,1]. Adequate for an internal
 * ranking signal; not a substitute for a real stats library and documented
 * as such.
 */
export function credibleInterval(p: BetaPosterior, z = 1.645): [number, number] {
  const n = p.alpha + p.beta;
  const mean = posteriorMean(p);
  const variance = (p.alpha * p.beta) / (n * n * (n + 1));
  const sd = Math.sqrt(Math.max(0, variance));
  return [Math.max(0, mean - z * sd), Math.min(1, mean + z * sd)];
}

export function effectiveSampleSize(p: BetaPosterior): number {
  return Math.max(0, p.alpha + p.beta - UNINFORMATIVE_PRIOR.alpha - UNINFORMATIVE_PRIOR.beta);
}

/**
 * Evidence class escalation: a prior-only belief starts at the
 * intervention's prior class; once real measurements accrue, the class can
 * step up (never automatically down — downgrades only happen via decay, see
 * src/lib/recommender/beliefUpdate.ts).
 */
export function evidenceClassForSample(
  priorClass: EvidenceClass,
  sampleSize: number,
  sourceType: "prior" | "commitment_followthrough" | "experiment_result",
): EvidenceClass {
  if (sourceType === "experiment_result" && sampleSize >= 20) return "causal_replicated";
  if (sourceType === "experiment_result" && sampleSize >= 5) return "experimental";
  if (sourceType === "commitment_followthrough" && sampleSize >= 8) return "correlational";
  return priorClass;
}
