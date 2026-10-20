import { createRng, nextGaussian } from "./prng";

export interface MonteCarloInput {
  /** Baseline (expected) value being forecast, e.g. a metric or revenue figure. */
  base: number;
  /** Relative volatility as a fraction of `base` (0.2 = ±20% typical swing). */
  volatility: number;
  /** Number of simulated trials. */
  trials: number;
  /** Seed for deterministic reproducibility. */
  seed: number;
}

export interface MonteCarloResult {
  seed: number;
  trials: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  p10: number;
  p50: number;
  p90: number;
  samples: number[];
}

export function percentile(sortedAscending: number[], p: number): number {
  if (sortedAscending.length === 0) return NaN;
  if (p <= 0) return sortedAscending[0];
  if (p >= 1) return sortedAscending[sortedAscending.length - 1];
  const index = p * (sortedAscending.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedAscending[lower];
  const weight = index - lower;
  const interpolated = sortedAscending[lower] * (1 - weight) + sortedAscending[upper] * weight;
  // Linear interpolation between two adjacent sorted values must stay within
  // [lower value, upper value] by definition, but floating-point rounding
  // can push the result a fraction of an ULP past the upper bound when the
  // two values are very close together. Clamp to guarantee the invariant
  // `min <= p10 <= p50 <= p90 <= max` always holds exactly, not "almost".
  return Math.min(Math.max(interpolated, sortedAscending[lower]), sortedAscending[upper]);
}

/**
 * Runs a deterministic Monte Carlo forecast: `trials` samples of
 * `base * (1 + volatility * Z)` where Z ~ N(0, 1), driven by the seeded PRNG
 * in `./prng`. Same `seed` + same inputs always produces the same output —
 * this is relied on by tests and by "replay this forecast" in the product.
 */
export function runMonteCarloForecast(input: MonteCarloInput): MonteCarloResult {
  const { base, volatility, trials, seed } = input;
  if (trials <= 0) throw new Error("trials must be a positive integer");
  if (volatility < 0) throw new Error("volatility must not be negative");

  const rng = createRng(seed);
  const samples: number[] = new Array(trials);
  for (let i = 0; i < trials; i++) {
    samples[i] = base * (1 + volatility * nextGaussian(rng));
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((sum, v) => sum + v, 0) / trials;
  const variance = samples.reduce((sum, v) => sum + (v - mean) ** 2, 0) / trials;

  return {
    seed,
    trials,
    mean,
    stdDev: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p10: percentile(sorted, 0.1),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    samples,
  };
}
