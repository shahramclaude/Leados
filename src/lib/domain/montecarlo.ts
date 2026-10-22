import type { Prng } from "@/lib/prng";

/**
 * Monte Carlo simulation harness. Reproducibility is the core contract:
 * given the same seed (via an injected `Prng`), `runMonteCarlo` must
 * produce byte-identical output across runs, machines, and Node versions.
 * This is why domain code is forbidden from calling `Math.random()`
 * directly — every source of randomness must flow through the injected
 * `Prng` so a run can be replayed exactly.
 */

export interface MonteCarloResult {
  readonly trials: number;
  readonly mean: number;
  readonly stdDev: number;
  readonly min: number;
  readonly max: number;
  readonly samples: readonly number[];
  /** Approximate percentile value, linear-interpolated. */
  percentile(p: number): number;
}

export function runMonteCarlo(
  trials: number,
  sample: (prng: Prng, trialIndex: number) => number,
  prng: Prng,
): MonteCarloResult {
  if (trials <= 0) throw new Error("trials must be > 0");
  const samples: number[] = new Array(trials);
  for (let i = 0; i < trials; i++) {
    samples[i] = sample(prng, i);
  }
  const mean = samples.reduce((a, b) => a + b, 0) / trials;
  const variance =
    samples.reduce((acc, v) => acc + (v - mean) ** 2, 0) / trials;
  const stdDev = Math.sqrt(variance);
  const sorted = [...samples].sort((a, b) => a - b);

  return {
    trials,
    mean,
    stdDev,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    samples,
    percentile(p: number): number {
      if (p < 0 || p > 100) throw new Error("percentile must be in [0,100]");
      const rank = (p / 100) * (sorted.length - 1);
      const lowerIdx = Math.floor(rank);
      const upperIdx = Math.ceil(rank);
      if (lowerIdx === upperIdx) return sorted[lowerIdx];
      const weight = rank - lowerIdx;
      return sorted[lowerIdx] * (1 - weight) + sorted[upperIdx] * weight;
    },
  };
}

/**
 * Simulate a PERT-distributed task duration using a Beta(4,4) scaled
 * approximation — a common Monte Carlo building block for schedule-risk
 * simulations layered on top of `pertEstimate`.
 */
export function samplePertDuration(
  prng: Prng,
  optimistic: number,
  mostLikely: number,
  pessimistic: number,
): number {
  // Two Gamma(4,1)-like draws approximated via averaging uniforms
  // (Irwin-Hall) to keep this dependency-free and fully seeded.
  const u = (a: number, b: number) => {
    let sum = 0;
    for (let i = 0; i < 4; i++) sum += prng.next();
    return a + (sum / 4) * (b - a);
  };
  const raw = u(0, 1);
  const skewTowardMode =
    mostLikely - optimistic === 0 && pessimistic - mostLikely === 0
      ? mostLikely
      : raw < 0.5
        ? optimistic + (mostLikely - optimistic) * (raw * 2)
        : mostLikely + (pessimistic - mostLikely) * ((raw - 0.5) * 2);
  return skewTowardMode;
}
