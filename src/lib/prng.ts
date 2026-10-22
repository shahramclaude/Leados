/**
 * Deterministic pseudo-random number generator for domain code and tests.
 *
 * Domain code MUST NOT call `Math.random()` directly (enforced by
 * `eslint.config.mjs` via `no-restricted-properties`). Instead inject a
 * `Prng` (or a numeric seed) so that simulations, Monte Carlo runs, and
 * synthetic data generation are byte-for-byte reproducible across runs,
 * machines, and CI.
 *
 * Algorithm: mulberry32 — small, fast, statistically adequate for
 * simulation/testing purposes (not cryptographic).
 */

export interface Prng {
  /** Returns a float in [0, 1). */
  next(): number;
  /** Returns an integer in [min, max]. */
  nextInt(min: number, max: number): number;
  /** Returns a sample from a standard normal distribution (Box-Muller). */
  nextGaussian(mean?: number, stdDev?: number): number;
  /** The seed this generator was created with (for logging/reproduction). */
  readonly seed: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPrng(seed: number): Prng {
  const rand = mulberry32(seed);
  let cachedGaussian: number | null = null;

  return {
    seed,
    next: rand,
    nextInt(min: number, max: number) {
      if (max < min) throw new Error("nextInt: max must be >= min");
      return Math.floor(rand() * (max - min + 1)) + min;
    },
    nextGaussian(mean = 0, stdDev = 1) {
      if (cachedGaussian !== null) {
        const value = cachedGaussian;
        cachedGaussian = null;
        return mean + stdDev * value;
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      const mag = Math.sqrt(-2.0 * Math.log(u));
      const z0 = mag * Math.cos(2.0 * Math.PI * v);
      const z1 = mag * Math.sin(2.0 * Math.PI * v);
      cachedGaussian = z1;
      return mean + stdDev * z0;
    },
  };
}
