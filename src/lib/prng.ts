// src/lib/prng.ts
//
// Deterministic, seedable pseudo-random number generator used throughout the
// GRC risk-quantification stack (Part 29). We deliberately avoid Math.random()
// so that:
//   1. Monte Carlo runs are reproducible for audit/evidence purposes.
//   2. The risk-model validation suite (scripts/validate-risk-model.ts) can
//      assert recovered percentiles against known analytic answers.
//
// mulberry32 is a small, fast, statistically-adequate PRNG for simulation
// work. It is NOT cryptographically secure and must never be used for
// anything security-sensitive (tokens, hash-chain nonces, etc.).

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash an arbitrary string into a 32-bit seed (xmur3). Deterministic. */
export function seedFromString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
