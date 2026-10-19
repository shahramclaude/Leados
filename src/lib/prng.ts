/**
 * src/lib/prng.ts
 *
 * Deterministic, seedable pseudo-random number generator used by every Monte
 * Carlo routine in this codebase (server-side `financialOS.ts` and the
 * client-side `monteCarloWorker.ts`).
 *
 * Algorithm: Mersenne Twister (MT19937).
 * Reference: Matsumoto, M. and Nishimura, T., "Mersenne Twister: A
 * 623-dimensionally equidistributed uniform pseudo-random number generator",
 * ACM Transactions on Modeling and Computer Simulation, 8(1), 1998.
 *
 * IMPORTANT: Math.random() must never be used for Monte Carlo simulation in
 * this project. It is not seeded, not specified by the ECMAScript standard
 * (implementations differ across engines), and therefore simulation runs are
 * not reproducible. MersenneTwister below gives identical output for a given
 * seed on every run, every platform.
 *
 * Exported function name: `createMersenneTwister`.
 */

const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

export class MersenneTwister {
  private mt: Uint32Array = new Uint32Array(N);
  private mti = N + 1;

  constructor(seed: number) {
    this.seedMt(seed >>> 0);
  }

  private seedMt(seed: number): void {
    this.mt[0] = seed >>> 0;
    for (this.mti = 1; this.mti < N; this.mti++) {
      const s = this.mt[this.mti - 1] ^ (this.mt[this.mti - 1] >>> 30);
      this.mt[this.mti] =
        ((((s & 0xffff0000) >>> 16) * 1812433253) << 16) +
        (s & 0x0000ffff) * 1812433253 +
        this.mti;
      this.mt[this.mti] >>>= 0;
    }
  }

  /** Generates the next 32-bit unsigned integer in the MT19937 sequence. */
  private nextUint32(): number {
    let y: number;
    const mag01 = [0x0, MATRIX_A];

    if (this.mti >= N) {
      let kk: number;
      for (kk = 0; kk < N - M; kk++) {
        y = (this.mt[kk] & UPPER_MASK) | (this.mt[kk + 1] & LOWER_MASK);
        this.mt[kk] = this.mt[kk + M] ^ (y >>> 1) ^ mag01[y & 0x1];
      }
      for (; kk < N - 1; kk++) {
        y = (this.mt[kk] & UPPER_MASK) | (this.mt[kk + 1] & LOWER_MASK);
        this.mt[kk] = this.mt[kk + (M - N)] ^ (y >>> 1) ^ mag01[y & 0x1];
      }
      y = (this.mt[N - 1] & UPPER_MASK) | (this.mt[0] & LOWER_MASK);
      this.mt[N - 1] = this.mt[M - 1] ^ (y >>> 1) ^ mag01[y & 0x1];
      this.mti = 0;
    }

    y = this.mt[this.mti++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;

    return y >>> 0;
  }

  /** Returns a float uniformly distributed on [0, 1). */
  random(): number {
    return this.nextUint32() * (1.0 / 4294967296.0);
  }
}

/** Factory for a seeded Mersenne Twister PRNG. Exported function name: `createMersenneTwister`. */
export function createMersenneTwister(seed: number): MersenneTwister {
  return new MersenneTwister(seed);
}
