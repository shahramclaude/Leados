// Part 06 stand-in: Monte Carlo / distribution engine. Re-implemented locally
// because no prior-part files existed in the sandbox checkout. Deterministic
// given a seed, so board-pack generation and backtests stay reproducible.

export type Rng = () => number;

/** mulberry32 — small, fast, deterministic PRNG. Same seed -> same stream, always. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Triangular distribution sample — the standard shape for low/base/high driver ranges. */
export function sampleTriangular(low: number, base: number, high: number, rng: Rng): number {
  if (high <= low) return base;
  const u = rng();
  const c = (base - low) / (high - low);
  if (u < c) return low + Math.sqrt(u * (high - low) * (base - low));
  return high - Math.sqrt((1 - u) * (high - low) * (high - base));
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = clamp((p / 100) * (sorted.length - 1), 0, sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export type DriverRange = { key: string; low: number; base: number; high: number };

/** Runs N trials of a model fn fed sampled driver values. Pure + seeded = reproducible. */
export function runMonteCarlo<T>(
  trials: number,
  drivers: DriverRange[],
  model: (sample: Record<string, number>, rng: Rng) => T,
  seed = 42,
): T[] {
  const rng = makeRng(seed);
  const out: T[] = [];
  for (let i = 0; i < trials; i++) {
    const sample: Record<string, number> = {};
    for (const d of drivers) sample[d.key] = sampleTriangular(d.low, d.base, d.high, rng);
    out.push(model(sample, rng));
  }
  return out;
}

export function distributionSummary(values: number[]): { p10: number; p50: number; p90: number; mean: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  return {
    p10: percentile(sorted, 10),
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    mean,
  };
}

/**
 * One-at-a-time sensitivity ("tornado"): perturb each driver to its low/high while
 * holding all others at base, measure the swing in the output metric.
 */
export function tornadoSensitivity(
  drivers: DriverRange[],
  metricAtBase: (overrides: Record<string, number>) => number,
): { key: string; low: number; high: number; swing: number }[] {
  const baseSample: Record<string, number> = {};
  for (const d of drivers) baseSample[d.key] = d.base;
  const rows = drivers.map((d) => {
    const lowSample = { ...baseSample, [d.key]: d.low };
    const highSample = { ...baseSample, [d.key]: d.high };
    const lowVal = metricAtBase(lowSample);
    const highVal = metricAtBase(highSample);
    return {
      key: d.key,
      low: lowVal,
      high: highVal,
      swing: Math.abs(highVal - lowVal),
    };
  });
  return rows.sort((a, b) => b.swing - a.swing);
}
