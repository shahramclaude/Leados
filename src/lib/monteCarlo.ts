// src/lib/monteCarlo.ts
//
// PROVENANCE NOTE: Parts 1-4 of this project (which would normally define
// this module) are not present in this sandbox/repo. This file is a
// from-scratch, minimal reconstruction of exactly the primitives Part 5
// (Financial Nervous System) needs: a seedable PRNG, a deterministic
// string->seed hash, and basic array statistics. Nothing here is copied
// from any file in this repo (there was nothing to copy from).
//
// We deliberately never use Math.random() anywhere downstream so that
// every simulation is reproducible from a seed.

/**
 * mulberry32 — a fast, small, seedable 32-bit PRNG.
 * Public-domain algorithm by Tommy Ettinger. Exact signature used
 * throughout this codebase:
 *
 *   mulberry32(seed: number): () => number
 *
 * Returns a generator function producing uniform floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * hashSeed — deterministic string -> 32-bit unsigned integer hash.
 * Uses the FNV-1a algorithm (Fowler/Noll/Vo, public domain, 1991) purely
 * as a convenient, well-known way to turn an arbitrary string (e.g. a
 * current cash balance) into a reproducible numeric seed for mulberry32.
 */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0;
}

/** Arithmetic mean of a numeric array. Returns 0 for an empty array. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * percentile — linear-interpolation ("nearest-rank with interpolation",
 * the common "R-7" method used by Excel/NumPy's default) percentile of a
 * numeric array. `p` is in [0, 100].
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const clampedP = Math.min(100, Math.max(0, p));
  const rank = (clampedP / 100) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];
  const weight = rank - lowerIndex;
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

/**
 * sampleStdNormal — draws one standard-normal sample Z ~ N(0, 1) using the
 * Box-Muller transform (Box, G. E. P. & Muller, M. E., "A Note on the
 * Generation of Random Normal Deviates", Annals of Mathematical
 * Statistics, 1958). This is the standard textbook derivation:
 *
 *   given u1, u2 ~ Uniform(0, 1):
 *     Z = sqrt(-2 * ln(u1)) * cos(2 * PI * u2)
 *
 * DISCLOSURE: this derivation is standard textbook material (Box & Muller,
 * 1958), not copied from any file in this repository.
 *
 * `rng` must be a mulberry32-style generator (or any () => number in
 * [0, 1)) so the draw stays fully reproducible from the outer seed.
 */
export function sampleStdNormal(rng: () => number): number {
  // Avoid ln(0) by flooring u1 away from exactly 0.
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
