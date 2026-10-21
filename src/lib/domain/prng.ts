/**
 * Deterministic, seedable PRNG (mulberry32). Domain code MUST derive all
 * randomness from a `Prng` instance rather than `Math.random()` so that
 * simulations, property tests and mutation tests are fully reproducible from
 * a seed. Enforced by `src/lib/domain/convention.test.ts` and the
 * `no-restricted-syntax` ESLint rule scoped to this directory.
 */
export type Prng = {
  readonly seed: number;
  next(): number; // uniform in [0, 1)
};

export function createPrng(seed: number): Prng {
  let state = seed >>> 0;
  return {
    seed,
    next(): number {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Standard normal sample via Box-Muller, driven entirely by the injected Prng. */
export function nextGaussian(prng: Prng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = prng.next();
  while (v === 0) v = prng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Bernoulli trial with success probability p, driven by the injected Prng. */
export function nextBernoulli(prng: Prng, p: number): 0 | 1 {
  return prng.next() < p ? 1 : 0;
}
