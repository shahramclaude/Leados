// Deterministic pseudo-random number generation + small statistics helpers
// used by the world model / Monte Carlo simulation engine (Part 59).
//
// Named algorithms, not "Math.random()":
//   - mulberry32: a 32-bit seeded PRNG (public domain, by Tommy Ettinger).
//     Same seed -> same stream, forever. This is what makes simulation runs
//     reproducible and property-testable.
//   - Box–Muller transform: converts two uniform(0,1) draws from the PRNG
//     into one standard-normal draw, used to sample residual noise.

/** mulberry32: returns a function that yields successive floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard-normal sample via the Box–Muller transform, using a caller-owned
 * uniform generator (so the whole draw sequence is reproducible from one
 * seed). Returns z ~ N(0, 1); scale by `mean + std * z` for N(mean, std^2).
 */
export function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  // Avoid log(0): u must be in (0, 1].
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const sse = xs.reduce((a, x) => a + (x - m) ** 2, 0);
  return Math.sqrt(sse / (xs.length - 1));
}

/**
 * Linear-interpolated percentile (the "R-7" / numpy-default method), p in
 * [0, 100]. Operates on a copy so the caller's array is never mutated.
 */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}
