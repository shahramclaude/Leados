/**
 * Deterministic seeded PRNG (mulberry32).
 *
 * Every simulated future in this module (scenarios, war-games, wind-tunnel
 * runs) is reproducible from a seed. This is what makes "same seed, same
 * matrix" verifiable rather than an assertion we hope is true.
 */
export type RNG = () => number;

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a 32-bit seed, so human-readable seeds ("world-3") are usable. */
export function seedFromString(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** Draw a value in [min, max) from an rng stream. */
export function range(rng: RNG, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Gaussian-ish noise via Box-Muller, deterministic given the rng stream. */
export function gaussian(rng: RNG, mean = 0, stdDev = 1): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdDev;
}
