// Deterministic, reproducible pseudo-random number generation for the
// contagion simulator. No `Math.random()` anywhere in the contagion path —
// every draw is a pure function of (seed, trial, edgeId/nodeId) so runs are
// exactly reproducible and so we can implement the live-edge monotone
// coupling trick used for the monotonicity property tests.

/** 32-bit string hash (FNV-1a) -> deterministic unsigned int. */
export function hashToUint32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic uniform(0,1) draw keyed by an arbitrary string key. Used to
 * assign each (trial, edge) pair a stable "live-edge" threshold draw
 * independent of traversal order, which is what makes the cascade monotone
 * in edge probability under a shared seed (see cascade.ts).
 */
export function deterministicUniform(key: string): number {
  const h = hashToUint32(key);
  const rng = mulberry32(h);
  return rng();
}
