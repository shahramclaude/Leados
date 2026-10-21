// Deterministic seeded PRNG (mulberry32) used by `scripts/seed.ts` so that
// every "org world" (small/medium/large) is byte-for-byte reproducible.
// Reproducibility is what lets later parts (02-23) write tests against a
// known fixture instead of re-seeding randomly every run.

export type Prng = {
  next: () => number; // float in [0, 1)
  int: (maxExclusive: number) => number;
  intBetween: (min: number, max: number) => number; // inclusive both ends
  pick: <T>(arr: readonly T[]) => T;
  shuffle: <T>(arr: readonly T[]) => T[];
  bool: (pTrue?: number) => boolean;
  uuid: () => string; // deterministic, RFC4122-v4-shaped string
};

/** mulberry32: small, fast, deterministic 32-bit PRNG. */
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

/** Hashes a string seed (e.g. an org name) into a 32-bit integer seed. */
export function seedFromString(input: string): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createPrng(seed: number | string): Prng {
  const numericSeed = typeof seed === "string" ? seedFromString(seed) : seed >>> 0;
  const next = mulberry32(numericSeed);

  const int = (maxExclusive: number) => Math.floor(next() * maxExclusive);
  const intBetween = (min: number, max: number) => min + int(max - min + 1);
  const pick = <T>(arr: readonly T[]): T => arr[int(arr.length)];
  const shuffle = <T>(arr: readonly T[]): T[] => {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const bool = (pTrue = 0.5) => next() < pTrue;

  // Deterministic "uuid-shaped" id. Not a cryptographically random UUID —
  // intentionally derived purely from the PRNG stream so two runs with the
  // same seed produce identical ids. Good enough for seeded fixtures; real
  // production ids come from `crypto.randomUUID()` in the event store.
  const uuid = () => {
    const hex = () => int(16).toString(16);
    const section = (n: number) => Array.from({ length: n }, hex).join("");
    return `${section(8)}-${section(4)}-4${section(3)}-${(8 + int(4)).toString(16)}${section(3)}-${section(12)}`;
  };

  return { next, int, intBetween, pick, shuffle, bool, uuid };
}
