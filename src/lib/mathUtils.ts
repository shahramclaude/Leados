// src/lib/mathUtils.ts
//
// Pure, dependency-free numeric helpers shared between the server (API
// routes), the client (chart components) and the Web Worker compute pool
// (src/workers/computeWorker.ts copies the two functions it needs verbatim
// — see the header comment in that file for why workers can't just import
// this module). Keeping this file pure (no I/O, no React, no DOM) means it
// never pulls anything heavy into whichever bundle imports it.

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Linear interpolation of the empirical CDF (NumPy default "linear" percentile method). */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const clampedP = clamp(p, 0, 1);
  const rank = clampedP * (sortedAsc.length - 1);
  const lowIndex = Math.floor(rank);
  const highIndex = Math.ceil(rank);
  if (lowIndex === highIndex) return sortedAsc[lowIndex];
  const weight = rank - lowIndex;
  return sortedAsc[lowIndex] * (1 - weight) + sortedAsc[highIndex] * weight;
}

/** Mulberry32 PRNG — small, fast, seedable. Used for reproducible simulations. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller transform: two Uniform(0,1) draws -> one standard-normal N(0,1) variate. */
export function sampleStandardNormal(rand: () => number): number {
  let u1 = rand();
  const u2 = rand();
  if (u1 < 1e-12) u1 = 1e-12;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** djb2 string hash — used to build stable cache keys from JSON-serializable inputs. */
export function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}
