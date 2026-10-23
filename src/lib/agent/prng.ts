// LEADOS Agent Kernel — seeded PRNG.
//
// Algorithm: mulberry32 (public-domain 32-bit PRNG by Tommy Ettinger).
// All randomness reachable from planner/executor/critic logic MUST be drawn
// from a `Prng` constructed with the run's recorded seed, never from
// `Math.random()`. This is what makes replay determinism measurable: same
// seed + same inputs -> byte-identical sequence of draws -> identical
// `replayHash`.
export interface Prng {
  readonly seed: string;
  next(): number; // float in [0, 1)
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

function hashSeedToUint32(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function createPrng(seed: string): Prng {
  let a = hashSeedToUint32(seed);
  const mulberry32 = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    next: mulberry32,
    int(maxExclusive: number) {
      return Math.floor(mulberry32() * maxExclusive);
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(mulberry32() * items.length)];
    },
  };
}
