// Deterministic, seedable pseudo-random number generation for the domain
// layer. Every math engine that needs randomness (Monte Carlo forecasting
// today; anything added later) MUST take its randomness through this module
// instead of calling Math.random() directly, so that:
//   - results are reproducible given the same seed (required for tests and
//     for "replay this forecast" in the product), and
//   - property-based tests can assert determinism as an invariant.

export type Rng = () => number;

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG. Not
 * cryptographically secure; this is for simulation, not security.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via the Box-Muller transform, driven by `rng`. */
export function nextGaussian(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
