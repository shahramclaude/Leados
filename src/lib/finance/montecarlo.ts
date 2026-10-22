// Part 08 depends on "Part 04's envelope / Monte Carlo" for parameter
// uncertainty propagation. That module does not exist in this repository
// snapshot (fresh starter template — Parts 01/04/06 were never committed),
// so this file implements the minimum deterministic surface Part 08 needs:
// a seeded PRNG, a normal sampler, percentile/band helpers, and a generic
// Monte Carlo driver. Downstream code only imports `MonteCarloBand` and
// `runMonteCarlo`, so swapping in Part 04's real envelope later is
// mechanical (same call signature).

export interface MonteCarloBand {
  p10: number;
  p50: number;
  p90: number;
}

/** Deterministic seeded PRNG (mulberry32) so simulations are reproducible
 * across requests and across the reconciliation/backtest test suite. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller normal sample. */
export function sampleNormal(rng: () => number, mean: number, std: number): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z0;
}

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

export function bandFromSamples(samples: number[]): MonteCarloBand {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p10: percentile(sorted, 0.1),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
  };
}

/** z-score such that [mean - z*std, mean + z*std] covers the central 80%
 * of a normal distribution (P10..P90). Used by the rolling forecast and
 * the backtest calibration check. */
export const Z_P80 = 1.2815515655446004;

/**
 * Generic Monte Carlo driver. `trial(rng)` runs one simulated path and must
 * return a map of series name -> number[] (one value per output month).
 * Returns P10/P50/P90 bands per series per month, computed from `iterations`
 * independent trials.
 */
export function runMonteCarlo(
  iterations: number,
  seed: number,
  trial: (rng: () => number) => Record<string, number[]>,
): Record<string, MonteCarloBand[]> {
  const rng = mulberry32(seed);
  const samples: Record<string, number[][]> = {};

  for (let i = 0; i < iterations; i++) {
    const out = trial(rng);
    for (const key of Object.keys(out)) {
      if (!samples[key]) samples[key] = out[key].map(() => []);
      out[key].forEach((v, m) => samples[key][m]?.push(v));
    }
  }

  const bands: Record<string, MonteCarloBand[]> = {};
  for (const key of Object.keys(samples)) {
    bands[key] = samples[key].map((monthSamples) => bandFromSamples(monthSamples));
  }
  return bands;
}
