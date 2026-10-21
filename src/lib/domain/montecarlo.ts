import { createPrng, nextGaussian, type Prng } from "./prng";

/**
 * Monte Carlo simulation engine for automation-run outcome forecasting.
 *
 * Reproducibility is the core invariant: given the same seed, trial count and
 * model parameters, `runMonteCarlo` MUST produce byte-identical output. All
 * randomness is drawn from the injected `Prng`; the engine never touches
 * `Math.random`.
 */
export type MonteCarloModel = {
  /** Expected single-trial outcome. */
  mean: number;
  /** Outcome standard deviation. */
  stdDev: number;
};

export type MonteCarloResult = {
  seed: number;
  trials: number;
  mean: number;
  stdDev: number;
  p05: number;
  p50: number;
  p95: number;
  samples: number[];
};

export function runMonteCarlo(
  model: MonteCarloModel,
  trials: number,
  seed: number,
): MonteCarloResult {
  if (trials <= 0) throw new Error("trials must be positive");
  const prng: Prng = createPrng(seed);
  const samples: number[] = new Array(trials);
  for (let i = 0; i < trials; i += 1) {
    samples[i] = model.mean + model.stdDev * nextGaussian(prng);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / trials;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / trials;
  return {
    seed,
    trials,
    mean,
    stdDev: Math.sqrt(variance),
    p05: percentile(sorted, 0.05),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    samples,
  };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
