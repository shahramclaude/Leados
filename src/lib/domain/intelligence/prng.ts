/**
 * prng.ts — deterministic pseudo-random number generator.
 *
 * ALGORITHM: mulberry32 (public-domain, by Tommy Ettinger). Chosen over
 * `Math.random()` because every golden dataset and Monte Carlo simulation in
 * this codebase (see `monteCarlo.ts`, `src/lib/eval/goldenData.ts`) MUST be
 * bit-for-bit reproducible from a seed so that `npm run eval:intelligence`
 * prints the same scorecard on every machine and every CI run. This is the
 * single PRNG implementation for the intelligence subsystem — every module
 * that needs randomness imports `makeRng` from here instead of hand-rolling
 * its own generator or calling `Math.random()`.
 *
 * Reference: https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
 */

export type Rng = {
  /** Uniform float in [0, 1). */
  next: () => number;
  /** Uniform float in [lo, hi). */
  range: (lo: number, hi: number) => number;
  /** Integer in [lo, hi] inclusive. */
  int: (lo: number, hi: number) => number;
  /** Standard normal draw via Box-Muller transform. */
  gaussian: (mu?: number, sigma?: number) => number;
  /** Draw from Beta(a,b) via two Gamma draws (Marsaglia-Tsang). */
  beta: (a: number, b: number) => number;
  /** The seed this generator was constructed with (for audit logging). */
  seed: number;
};

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

function gammaSample(rawNext: () => number, gaussianFn: () => number, shape: number): number {
  // Marsaglia & Tsang (2000) "A Simple Method for Generating Gamma Variables".
  if (shape < 1) {
    const u = rawNext();
    return gammaSample(rawNext, gaussianFn, 1 + shape) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = gaussianFn();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rawNext();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function makeRng(seed: number): Rng {
  const rawNext = mulberry32(seed);
  let spareGaussian: number | null = null;

  const gaussianStd = (): number => {
    if (spareGaussian !== null) {
      const v = spareGaussian;
      spareGaussian = null;
      return v;
    }
    let u1 = rawNext();
    let u2 = rawNext();
    if (u1 < 1e-12) u1 = 1e-12;
    const mag = Math.sqrt(-2 * Math.log(u1));
    const z0 = mag * Math.cos(2 * Math.PI * u2);
    const z1 = mag * Math.sin(2 * Math.PI * u2);
    spareGaussian = z1;
    return z0;
  };

  const rng: Rng = {
    seed,
    next: () => rawNext(),
    range: (lo, hi) => lo + (hi - lo) * rawNext(),
    int: (lo, hi) => lo + Math.floor(rawNext() * (hi - lo + 1)),
    gaussian: (mu = 0, sigma = 1) => mu + sigma * gaussianStd(),
    beta: (a, b) => {
      const x = gammaSample(rawNext, gaussianStd, a);
      const y = gammaSample(rawNext, gaussianStd, b);
      return x / (x + y);
    },
  };
  return rng;
}

/** FNV-1a 32-bit hash rendered as hex — used by `forecastCache.ts` to build
 * a stable `inputsHash` cache key from a JSON-serializable inputs object. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Derive a new deterministic sub-seed from a string key, so callers can get
 * independent-but-reproducible streams per entity without sharing state
 * (e.g. `deriveSeed(baseSeed, "person:p123")`). FNV-1a hash, 32-bit. */
export function deriveSeed(baseSeed: number, key: string): number {
  let h = (baseSeed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
