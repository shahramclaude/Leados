/**
 * src/workers/monteCarloWorker.ts
 *
 * Client-side Web Worker that runs the exact same Monte Carlo runway
 * simulation as `src/lib/financialOS.ts#runMonteCarloRunway`, so the
 * what-if panel can recalculate live without ever blocking the main thread.
 *
 * IMPORTANT: Web Workers bundled by Next.js cannot import server-only
 * modules (and in general it's best for a worker script to be a fully
 * self-contained bundle entry). Everything below — the Mersenne Twister
 * PRNG, the Box-Muller normal sampler, the percentile function, and the
 * simulation loop itself — is therefore a direct line-for-line port of the
 * server implementation rather than a shared import. If you change the
 * simulation algorithm in financialOS.ts, mirror the change here too.
 */

// ---------------------------------------------------------------------------
// Mersenne Twister (MT19937) PRNG — ported from src/lib/prng.ts
// Reference: Matsumoto, M. and Nishimura, T., "Mersenne Twister: A
// 623-dimensionally equidistributed uniform pseudo-random number generator",
// ACM TOMACS, 8(1), 1998.
// Math.random() is intentionally NOT used here: it is unseeded and not
// reproducible, which would make slider-driven what-if comparisons noisy.
// ---------------------------------------------------------------------------
const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

class MersenneTwister {
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

  random(): number {
    return this.nextUint32() * (1.0 / 4294967296.0);
  }
}

/** Box-Muller transform: two Uniform(0,1) draws -> one standard-normal N(0,1) variate. */
function sampleStandardNormal(rng: MersenneTwister): number {
  let u1 = rng.random();
  const u2 = rng.random();
  if (u1 < 1e-12) u1 = 1e-12;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Compound (geometric) growth step: value(t) = value(t-1) * (1 + rate). */
function compoundGrowthStep(previousValue: number, rate: number): number {
  return previousValue * (1 + rate);
}

/** Linear interpolation of the empirical CDF (NumPy default `linear` percentile method). */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const clampedP = Math.min(1, Math.max(0, p));
  const rank = clampedP * (sortedAsc.length - 1);
  const lowIndex = Math.floor(rank);
  const highIndex = Math.ceil(rank);
  if (lowIndex === highIndex) return sortedAsc[lowIndex];
  const weight = rank - lowIndex;
  return sortedAsc[lowIndex] * (1 - weight) + sortedAsc[highIndex] * weight;
}

const MAX_SIMULATED_MONTHS = 60;
const HISTOGRAM_BUCKET_SIZE_MONTHS = 3;

export interface RunwayParams {
  currentBalance: number;
  monthlyBurnMean: number;
  monthlyBurnStdDev: number;
  expectedMonthlyRevenue: number;
  revenueGrowthRate: number;
  n: number;
  seed: number;
  requestId: number;
}

export interface RunwayDistribution {
  p10RunwayMonths: number;
  p50RunwayMonths: number;
  p90RunwayMonths: number;
  probabilityOfRunwayAbove18Months: number;
  probabilityOfRunwayAbove12Months: number;
  pathsBelow6Months: number;
  histogram: { bucketMonths: number; count: number }[];
  requestId: number;
}

/** Direct port of financialOS.ts#runMonteCarloRunway — see that file for the full formula writeup. */
function runMonteCarloRunway(params: RunwayParams): RunwayDistribution {
  const { currentBalance, monthlyBurnMean, monthlyBurnStdDev, expectedMonthlyRevenue, revenueGrowthRate, n, seed } =
    params;

  const rng = new MersenneTwister(seed);
  const runways = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    let balance = currentBalance;
    let revenue = expectedMonthlyRevenue;
    let month = 0;

    while (balance > 0 && month < MAX_SIMULATED_MONTHS) {
      const z = sampleStandardNormal(rng);
      const burnThisMonth = Math.max(0, monthlyBurnMean + z * monthlyBurnStdDev);
      revenue = compoundGrowthStep(revenue, revenueGrowthRate);
      const netBurn = burnThisMonth - revenue;
      balance -= netBurn;
      month += 1;
    }

    runways[i] = month;
  }

  runways.sort((a, b) => a - b);

  const p10 = percentile(runways, 0.1);
  const p50 = percentile(runways, 0.5);
  const p90 = percentile(runways, 0.9);

  const above18 = runways.filter((m) => m >= 18).length / n;
  const above12 = runways.filter((m) => m >= 12).length / n;
  const below6 = runways.filter((m) => m < 6).length / n;

  const histogramMap = new Map<number, number>();
  for (const m of runways) {
    const bucket = Math.floor(m / HISTOGRAM_BUCKET_SIZE_MONTHS) * HISTOGRAM_BUCKET_SIZE_MONTHS;
    histogramMap.set(bucket, (histogramMap.get(bucket) ?? 0) + 1);
  }
  const histogram = Array.from(histogramMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bucketMonths, count]) => ({ bucketMonths, count }));

  return {
    p10RunwayMonths: p10,
    p50RunwayMonths: p50,
    p90RunwayMonths: p90,
    probabilityOfRunwayAbove18Months: above18,
    probabilityOfRunwayAbove12Months: above12,
    pathsBelow6Months: below6,
    histogram,
    requestId: params.requestId,
  };
}

addEventListener("message", (event: MessageEvent<RunwayParams>) => {
  const result = runMonteCarloRunway(event.data);
  postMessage(result);
});
