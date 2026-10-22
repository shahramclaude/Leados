// src/lib/twin/prng.ts
//
// Deterministic PRNG primitives for the LEADOS digital twin.
//
// EVERY stochastic draw in the simulation engine MUST flow through this
// module. Raw `Math.random()` is treated as a defect anywhere under
// `src/lib/twin` (see Phase 0 discovery notes in AI-SESSION-LOG.md) because it
// cannot be seeded, replayed, or audited.
//
// Design:
//  - `hashToUint32` turns an arbitrary string into a 32-bit unsigned seed
//    (FNV-1a). This is used to derive independent sub-streams.
//  - `seedHash(...parts)` builds a stable per-component seed, e.g.
//    `seedHash(runId, "arrivals")` and `seedHash(runId, "network")` produce
//    unrelated streams for the same run so that, for example, resampling the
//    network does not perturb the arrival process (required for one-at-a-time
//    attribution and antithetic variance reduction to be valid).
//  - `createRng(seed)` returns a small stateful RNG object (mulberry32 core)
//    with convenience samplers (uniform, normal, logNormal, poisson,
//    bernoulli, pick) all derived from the same deterministic stream.
//  - `antithetic: true` flips every draw `u -> 1 - u`, which is the standard
//    antithetic-variates trick: pairing a run with its "mirror" run (same
//    seed, flipped uniforms) and averaging the pair reduces variance for any
//    monotone response to the underlying uniforms.

export function hashToUint32(input: string): number {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Force unsigned 32-bit
  return hash >>> 0;
}

/**
 * Derive a stable per-component seed from arbitrary string/number parts.
 * `seedHash("run-42", "network")` !== `seedHash("run-42", "arrivals")`.
 */
export function seedHash(...parts: Array<string | number>): number {
  return hashToUint32(parts.map((p) => String(p)).join("::"));
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

export interface Rng {
  readonly seed: number;
  readonly antithetic: boolean;
  /** Uniform [0,1) draw. */
  next(): number;
  uniform(min: number, max: number): number;
  normal(mean: number, sd: number): number;
  logNormal(mu: number, sigma: number): number;
  poisson(lambda: number): number;
  bernoulli(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  /** Spawn an independent child stream keyed off this stream + a label. */
  child(label: string): Rng;
}

export function createRng(seed: number, antithetic = false): Rng {
  const raw = mulberry32(seed >>> 0);
  let cachedNormal: number | null = null;

  const next = (): number => {
    const u = raw();
    return antithetic ? 1 - u : u;
  };

  const api: Rng = {
    seed: seed >>> 0,
    antithetic,
    next,
    uniform(min: number, max: number) {
      return min + (max - min) * next();
    },
    normal(mean: number, sd: number) {
      if (cachedNormal !== null) {
        const v = cachedNormal;
        cachedNormal = null;
        return mean + sd * v;
      }
      // Box-Muller
      let u1 = next();
      // avoid log(0)
      if (u1 <= 1e-12) u1 = 1e-12;
      const u2 = next();
      const r = Math.sqrt(-2 * Math.log(u1));
      const theta = 2 * Math.PI * u2;
      const z0 = r * Math.cos(theta);
      const z1 = r * Math.sin(theta);
      cachedNormal = z1;
      return mean + sd * z0;
    },
    logNormal(mu: number, sigma: number) {
      return Math.exp(api.normal(mu, sigma));
    },
    poisson(lambda: number) {
      // Knuth's algorithm - fine for the lambdas used in this engine (<50).
      if (lambda <= 0) return 0;
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > L);
      return k - 1;
    },
    bernoulli(p: number) {
      return next() < p;
    },
    pick<T>(arr: readonly T[]): T {
      const idx = Math.min(arr.length - 1, Math.floor(next() * arr.length));
      return arr[idx];
    },
    child(label: string) {
      return createRng(seedHash(seed, label), antithetic);
    },
  };
  return api;
}

/** Stable JSON stringify (sorted keys) used for hashing scenarios/results. */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet();
  const sorter = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return null;
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(sorter);
    const obj = v as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sorter(obj[k]);
        return acc;
      }, {});
  };
  return JSON.stringify(sorter(value));
}

export function hashObject(value: unknown): string {
  return hashToUint32(stableStringify(value)).toString(16).padStart(8, "0");
}
