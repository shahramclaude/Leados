// Deterministic, seedable random-number utilities shared by every simulation
// in the strategy/finance layer (Monte Carlo runway, scenario studio,
// wargame outcomes, schedule-risk simulation). Using a seeded PRNG instead
// of Math.random() is what makes `/api/financial/simulate` reproducible:
// the same seed + inputs always produce the exact same distribution, which
// is required for the reproducibility test suite.

/** mulberry32 — small, fast, good-enough-for-simulation seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal sampler via Box–Muller, driven by a supplied uniform RNG. */
export function makeGaussian(rng: () => number): () => number {
  let spare: number | null = null;
  return function gaussian(): number {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u1 = 0;
    let u2 = 0;
    while (u1 === 0) u1 = rng();
    while (u2 === 0) u2 = rng();
    const mag = Math.sqrt(-2 * Math.log(u1));
    const z0 = mag * Math.cos(2 * Math.PI * u2);
    const z1 = mag * Math.sin(2 * Math.PI * u2);
    spare = z1;
    return z0;
  };
}

/** Nearest-rank percentile over a sorted-or-unsorted numeric array. */
export function percentile(sortedOrUnsorted: number[], p: number): number {
  if (sortedOrUnsorted.length === 0) return 0;
  const arr = [...sortedOrUnsorted].sort((a, b) => a - b);
  const idx = Math.min(arr.length - 1, Math.max(0, Math.ceil((p / 100) * arr.length) - 1));
  return arr[idx];
}

export interface HistogramBucket {
  from: number;
  to: number;
  count: number;
}

/** Fixed-bucket-count histogram for charting a distribution. */
export function buildHistogram(values: number[], buckets = 20): HistogramBucket[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = span / buckets;
  const bins: HistogramBucket[] = Array.from({ length: buckets }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    const idx = Math.min(buckets - 1, Math.floor((v - min) / width));
    bins[idx].count += 1;
  }
  return bins;
}

export interface Distribution {
  n: number;
  seed: number;
  mean: number;
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  histogram: HistogramBucket[];
}

/** Summarizes a raw sample array into the standard p10/p50/p90 distribution shape. */
export function summarizeDistribution(samples: number[], seed: number): Distribution {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1);
  return {
    n: sorted.length,
    seed,
    mean,
    p5: percentile(sorted, 5),
    p10: percentile(sorted, 10),
    p25: percentile(sorted, 25),
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    histogram: buildHistogram(sorted, 20),
  };
}
