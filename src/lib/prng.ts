/**
 * prng.ts — deterministic, seeded pseudo-random number generation.
 *
 * Every stochastic process in LEADOS (belief sampling, Monte Carlo,
 * synthetic calibration scenarios) MUST derive its randomness from this
 * module so that `identical seeds -> identical results` holds as a
 * verifiable property (see scripts/property-tests.ts).
 *
 * Algorithm: splitmix64-style seed expansion feeding a mulberry32 core.
 * Not cryptographically secure — this is a statistics/simulation PRNG.
 */

export type Seed = number | string;

function hashStringToUint32(input: string): number {
  // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function normalizeSeed(seed: Seed): number {
  return typeof seed === "number" ? seed >>> 0 : hashStringToUint32(seed);
}

/** mulberry32: fast, small-state, well-distributed 32-bit PRNG. */
export class Rng {
  private state: number;
  readonly seed: number;

  constructor(seed: Seed) {
    this.seed = normalizeSeed(seed);
    this.state = this.seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [lo, hi). */
  uniform(lo = 0, hi = 1): number {
    return lo + (hi - lo) * this.next();
  }

  /** Integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** Standard normal via Box-Muller, returns a pair; caches the second. */
  private cachedNormal: number | null = null;
  normal(mean = 0, sd = 1): number {
    if (this.cachedNormal !== null) {
      const z = this.cachedNormal;
      this.cachedNormal = null;
      return mean + sd * z;
    }
    let u1 = this.next();
    // avoid log(0)
    if (u1 < 1e-12) u1 = 1e-12;
    const u2 = this.next();
    const r = Math.sqrt(-2 * Math.log(u1));
    const z0 = r * Math.cos(2 * Math.PI * u2);
    const z1 = r * Math.sin(2 * Math.PI * u2);
    this.cachedNormal = z1;
    return mean + sd * z0;
  }

  /** Bernoulli draw, true with probability p. */
  bernoulli(p: number): boolean {
    return this.next() < p;
  }

  /** Beta(alpha, beta) draw via two Gamma draws (Marsaglia-Tsang). */
  beta(alpha: number, beta: number): number {
    const x = this.gamma(alpha);
    const y = this.gamma(beta);
    return x / (x + y);
  }

  /** Gamma(shape, 1) draw via Marsaglia-Tsang method (shape > 0). */
  gamma(shape: number): number {
    if (shape < 1) {
      const u = this.next();
      return this.gamma(1 + shape) * Math.pow(u, 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number;
      let v: number;
      do {
        x = this.normal(0, 1);
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = this.next();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  /** Spawn an independent child stream (deterministic given parent seed + index). */
  child(index: number): Rng {
    return new Rng(`${this.seed}:${index}`);
  }
}

export function createRng(seed: Seed): Rng {
  return new Rng(seed);
}
