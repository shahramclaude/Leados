/**
 * Deterministic seeded PRNG utilities.
 *
 * STATUS: Part 01 of the LEADOS build is expected to own `src/lib/prng.ts`.
 * This repository snapshot does not yet contain Parts 01-25, so Part 26
 * bootstraps a minimal, spec-compatible implementation here. If/when the
 * real Part 01 module lands, this file should be replaced by it verbatim
 * (the public surface below — `createRng`, `seedFromString`, `shuffle`,
 * `pick`) is the contract Part 26 depends on.
 *
 * Algorithm: mulberry32 — small, fast, deterministic, good enough statistical
 * quality for assignment/randomization (not for cryptography).
 */

export type Rng = () => number;

/** Build a deterministic RNG from a 32-bit integer seed. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return function mulberry32() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a stable 32-bit seed from an arbitrary string (FNV-1a hash). */
export function seedFromString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Create a deterministic RNG seeded by a string key (e.g. "program:P1:rollout"). */
export function rngFromKey(key: string): Rng {
  return createRng(seedFromString(key));
}

/** Deterministic Fisher-Yates shuffle (does not mutate input). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Deterministically pick one item weighted by a uniform draw. */
export function pick<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error("pick: items must be non-empty");
  const idx = Math.floor(rng() * items.length);
  return items[Math.min(idx, items.length - 1)];
}

/** Deterministic Bernoulli draw, true with probability p. */
export function bernoulli(p: number, rng: Rng): boolean {
  return rng() < p;
}
