/**
 * src/lib/monteCarlo.ts
 *
 * Shared statistical primitives for Monte Carlo simulation. These are used by
 * `financialOS.ts` (server) and are intentionally re-implemented (duplicated,
 * not imported) inside `src/workers/monteCarloWorker.ts` because a Web Worker
 * cannot import server-only modules and we want the worker bundle to be a
 * fully self-contained script.
 *
 * Every formula below is labeled with its textbook name. Anything that is a
 * simplification rather than a rigorous model is explicitly marked
 * UNVERIFIED.
 */

import type { MersenneTwister } from "./prng";

/**
 * Box-Muller transform.
 * Converts two independent Uniform(0,1) draws into one standard-normal
 * N(0,1) variate: Z = sqrt(-2 ln U1) * cos(2*pi*U2).
 * Reference: Box, G.E.P. and Muller, M.E., "A Note on the Generation of
 * Random Normal Deviates", Annals of Mathematical Statistics, 1958.
 */
export function sampleStandardNormal(rng: MersenneTwister): number {
  let u1 = rng.random();
  const u2 = rng.random();
  // Guard against log(0) when u1 is numerically zero.
  if (u1 < 1e-12) u1 = 1e-12;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Arithmetic mean. */
export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Sample standard deviation using Bessel's correction (n - 1 denominator),
 * the standard unbiased estimator of population variance from a sample.
 */
export function sampleStdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const sumSq = xs.reduce((acc, x) => acc + (x - m) ** 2, 0);
  return Math.sqrt(sumSq / (xs.length - 1));
}

/**
 * Percentile / quantile estimator using linear interpolation between the two
 * closest ranks of the empirical CDF (equivalent to NumPy's default
 * `linear` interpolation method for `numpy.percentile`).
 *
 * @param sortedAsc values already sorted ascending
 * @param p fraction in [0, 1] (e.g. 0.5 for the median)
 */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const clampedP = Math.min(1, Math.max(0, p));
  const rank = clampedP * (sortedAsc.length - 1);
  const lowIndex = Math.floor(rank);
  const highIndex = Math.ceil(rank);
  if (lowIndex === highIndex) return sortedAsc[lowIndex];
  const weight = rank - lowIndex;
  return sortedAsc[lowIndex] * (1 - weight) + sortedAsc[highIndex] * weight;
}

/**
 * Compound (geometric) growth step: value(t) = value(t-1) * (1 + rate).
 * Standard discrete compounding formula, not stochastic.
 */
export function compoundGrowthStep(previousValue: number, rate: number): number {
  return previousValue * (1 + rate);
}
