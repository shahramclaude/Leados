/**
 * src/lib/mathUtils.ts
 *
 * Pure numeric primitives shared by the simulation engine and the stats
 * layer. Re-implemented to match the canonical repo's `src/lib/mathUtils.ts`
 * API (same function names/signatures) so this slice merges cleanly — see
 * AI-SESSION-LOG.md for the read-before-write note.
 *
 * No I/O, no ambient randomness — the only randomness is the explicit
 * seeded PRNG below, so every caller is reproducible.
 */

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return sum(xs) / xs.length;
}

export function variance(xs: number[], ddof = 1): number {
  if (xs.length <= ddof) return NaN;
  const m = mean(xs);
  return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - ddof);
}

export function std(xs: number[], ddof = 1): number {
  return Math.sqrt(variance(xs, ddof));
}

export function quantile(xs: number[], p: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function linspace(start: number, stop: number, n: number): number[] {
  if (n <= 1) return [start];
  const step = (stop - start) / (n - 1);
  return Array.from({ length: n }, (_, i) => start + step * i);
}

/** Deterministic, seedable PRNG (mulberry32) — same algorithm as the
 * canonical repo, so a given seed produces the same stream here and there. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hashes a string seed (e.g. "tenant:scenario:inputsHash") to a uint32 seed
 * for mulberry32, so callers can seed by a stable string key. */
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Standard normal sample via Box-Muller, driven by an injected PRNG. */
export function randNormal(rand: () => number, mu = 0, sigma = 1): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mu + sigma * z;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Largest-Triangle-Three-Buckets downsampling (Sveinn Steinarsson, 2013).
 * Reduces a time series of N points to `threshold` points while preserving
 * visual shape (peaks/troughs) far better than naive stride sampling —
 * used by ForecastChart so a 2,000-week/percentile-band series never ships
 * more than ~400 SVG points to the browser. Documented in
 * docs/PERFORMANCE.md "Progressive chart rendering".
 */
export function lttb<T>(data: T[], threshold: number, getX: (d: T) => number, getY: (d: T) => number): T[] {
  const n = data.length;
  if (threshold >= n || threshold <= 2) return data;

  const sampled: T[] = [];
  const every = (n - 2) / (threshold - 2);

  let a = 0; // index of last sampled point
  sampled.push(data[a]);

  for (let i = 0; i < threshold - 2; i++) {
    const avgRangeStart = Math.floor((i + 1) * every) + 1;
    const avgRangeEndRaw = Math.floor((i + 2) * every) + 1;
    const avgRangeEnd = Math.min(avgRangeEndRaw, n);

    let avgX = 0;
    let avgY = 0;
    const rangeLength = avgRangeEnd - avgRangeStart;
    for (let j = avgRangeStart; j < avgRangeEnd; j++) {
      avgX += getX(data[j]);
      avgY += getY(data[j]);
    }
    avgX /= Math.max(rangeLength, 1);
    avgY /= Math.max(rangeLength, 1);

    const rangeOffs = Math.floor(i * every) + 1;
    const rangeTo = Math.floor((i + 1) * every) + 1;

    const pointAX = getX(data[a]);
    const pointAY = getY(data[a]);

    let maxArea = -1;
    let nextA = rangeOffs;
    for (let j = rangeOffs; j < rangeTo && j < n; j++) {
      const area = Math.abs(
        (pointAX - avgX) * (getY(data[j]) - pointAY) - (pointAX - getX(data[j])) * (avgY - pointAY),
      ) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        nextA = j;
      }
    }
    sampled.push(data[nextA]);
    a = nextA;
  }

  sampled.push(data[n - 1]);
  return sampled;
}
