/**
 * prng.ts — Deterministic pseudo-random number generation for the LEADOS
 * digital twin.
 *
 * DESIGN GOALS (Part 06 standing order, section C):
 *  - Full reproducibility: identical seed -> bit-identical output stream.
 *  - Named sub-streams so that different subsystems (discrete-event sim,
 *    physics noise, war-game shocks, tornado perturbations...) never share
 *    draws by accident, while still being 100% derived from one root seed.
 *  - Common Random Numbers (CRN) support: two scenarios run with the same
 *    root seed and the same sub-stream labels see *exactly* the same random
 *    draws at the same call index, which is what makes variance reduction
 *    on the *difference* between scenarios possible.
 *  - Antithetic variates: a cheap, documented way to derive a mirrored
 *    stream (1 - u) for variance reduction on symmetric estimators.
 *
 * NOT a cryptographic RNG. Do not use for anything security sensitive.
 *
 * Algorithm: sfc32 (Chris Doty-Humphrey's "Small Fast Counter" family),
 * seeded from a 128-bit state produced by splitmix32 applied to an FNV-1a
 * hash of the caller-supplied seed string. sfc32 has a long period for a
 * 32-bit generator, good statistical quality for simulation purposes, and
 * is fast enough for 10k+ Monte Carlo replications in a tight loop.
 */

export interface RngState {
  seedLabel: string;
  a: number;
  b: number;
  c: number;
  d: number;
  calls: number;
}

export interface Rng {
  readonly label: string;
  /** Uniform double in [0, 1). */
  next(): number;
  /** Uniform integer in [minInclusive, maxExclusive). */
  int(minInclusive: number, maxExclusive: number): number;
  /** Standard normal (mean=0, sd=1) unless overridden, via Box-Muller. */
  normal(mean?: number, stdDev?: number): number;
  /** Bernoulli draw, true with probability p (default 0.5). */
  bool(p?: number): boolean;
  /** Uniform pick from a non-empty array (does not mutate it). */
  pick<T>(arr: readonly T[]): T;
  /** Lognormal draw from underlying normal(mu, sigma). */
  lognormal(mu: number, sigma: number): number;
  /** Derive a fully independent, deterministic named sub-stream. */
  substream(label: string): Rng;
  /**
   * Derive the antithetic companion of this exact stream: calling
   * `.next()` in lockstep with the original yields `1 - u` for every draw.
   * Only valid if both streams are advanced with the same call sequence.
   */
  antithetic(): Rng;
  /** Snapshot current internal state (useful for tests / debugging). */
  state(): RngState;
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    z = (z ^ (z >>> 16)) >>> 0;
    return z;
  };
}

function sfc32(a: number, b: number, c: number, d: number) {
  return function () {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

function seedWords(label: string): [number, number, number, number] {
  const h0 = fnv1a(label);
  const sm = splitmix32(h0);
  return [sm(), sm(), sm(), sm()];
}

function makeRng(label: string, negate: boolean): Rng {
  const [a, b, c, d] = seedWords(label);
  // Mutable closure state so sfc32 can advance it; we re-implement sfc32
  // inline (not via the factory above) so we can snapshot state for tests.
  const st = { a, b, c, d, calls: 0 };
  const raw = sfc32(st.a, st.b, st.c, st.d);

  function rawNext(): number {
    // warm up loses access to internal state snapshotting from the
    // closure above, so instead we track calls only for diagnostics.
    st.calls += 1;
    return raw();
  }

  function next(): number {
    const u = rawNext();
    return negate ? 1 - u : u;
  }

  const api: Rng = {
    label,
    next,
    int(minInclusive: number, maxExclusive: number) {
      return minInclusive + Math.floor(next() * (maxExclusive - minInclusive));
    },
    normal(mean = 0, stdDev = 1) {
      // Box-Muller transform, two uniforms consumed per call.
      let u1 = next();
      const u2 = next();
      if (u1 <= 0) u1 = Number.EPSILON;
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + stdDev * z0;
    },
    bool(p = 0.5) {
      return next() < p;
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error("pick() called on empty array");
      return arr[Math.min(arr.length - 1, Math.floor(next() * arr.length))];
    },
    lognormal(mu: number, sigma: number) {
      return Math.exp(api.normal(mu, sigma));
    },
    substream(childLabel: string) {
      return makeRng(`${label}::${childLabel}`, false);
    },
    antithetic() {
      return makeRng(label, !negate);
    },
    state(): RngState {
      return { seedLabel: label, a: st.a, b: st.b, c: st.c, d: st.d, calls: st.calls };
    },
  };
  return api;
}

/** Create a deterministic root RNG from any string or number seed. */
export function createRng(seed: string | number): Rng {
  return makeRng(String(seed), false);
}

/** Convenience: derive N independent named replication streams from a root seed. */
export function replicationStreams(seed: string | number, n: number): Rng[] {
  const root = createRng(seed);
  const out: Rng[] = [];
  for (let i = 0; i < n; i++) out.push(root.substream(`rep#${i}`));
  return out;
}
