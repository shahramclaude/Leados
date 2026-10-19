// src/lib/monteCarlo.ts
// Generic Monte Carlo runner used by scenarioEngine.ts.
// Exported function: `runMonteCarlo` (line 15).

export interface MonteCarloBand {
  p10: number[];
  p50: number[];
  p90: number[];
  paths: number[][];
}

/**
 * runMonteCarlo
 * Runs `trials` simulated paths (each produced by `simulateOnePath`) and
 * returns the p10 / p50 / p90 band across the horizon, plus the raw paths
 * (capped) for downstream histogram rendering.
 */
export function runMonteCarlo(
  simulateOnePath: (trialIndex: number) => number[],
  trials = 1000,
): MonteCarloBand {
  const paths: number[][] = [];
  for (let t = 0; t < trials; t++) {
    paths.push(simulateOnePath(t));
  }
  const horizon = paths[0]?.length ?? 0;
  const p10: number[] = [];
  const p50: number[] = [];
  const p90: number[] = [];

  for (let m = 0; m < horizon; m++) {
    const slice = paths.map((p) => p[m]).sort((a, b) => a - b);
    p10.push(percentile(slice, 0.1));
    p50.push(percentile(slice, 0.5));
    p90.push(percentile(slice, 0.9));
  }

  return { p10, p50, p90, paths: paths.slice(0, 200) };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(p * sortedAsc.length)));
  return sortedAsc[idx];
}

/** Box-Muller normal sample, mean 0 stdev 1 */
export function sampleNormal(rand: () => number = Math.random): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** Simple deterministic mulberry32 PRNG so repeated runs can be seeded */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
