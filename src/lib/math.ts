// ---------------------------------------------------------------------------
// math.ts — low level numeric primitives shared across the engine.
// Every function here is a textbook implementation (no proprietary logic).
// ---------------------------------------------------------------------------

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Population standard deviation (divide by n). We use the population
 * variant throughout the metrics engine because we generally treat the
 * observed history as the full population of interest for a given rolling
 * window, not a sample drawn from a larger population.
 */
export function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

/** Standard z-score: (x - mean) / stdDev. Returns 0 if stdDev is 0. */
export function zScore(x: number, m: number, sd: number): number {
  if (sd === 0) return 0;
  return (x - m) / sd;
}

export interface WeightedTrendResult {
  slope: number;
  intercept: number;
}

/**
 * Weighted least squares trend line through points (x, y) with per-point
 * weights. Used for recency-weighted trend estimation (more recent points
 * weighted higher via temporal.ts::recencyWeight).
 */
export function weightedTrend(
  points: { x: number; y: number; weight: number }[],
): WeightedTrendResult {
  if (points.length === 0) return { slope: 0, intercept: 0 };
  let sw = 0;
  let swx = 0;
  let swy = 0;
  let swxx = 0;
  let swxy = 0;
  for (const { x, y, weight } of points) {
    sw += weight;
    swx += weight * x;
    swy += weight * y;
    swxx += weight * x * x;
    swxy += weight * x * y;
  }
  const denom = sw * swxx - swx * swx;
  if (denom === 0) return { slope: 0, intercept: sw > 0 ? swy / sw : 0 };
  const slope = (sw * swxy - swx * swy) / denom;
  const intercept = (swy - slope * swx) / sw;
  return { slope, intercept };
}

/**
 * Classic PageRank over a weighted directed adjacency map. Used by the
 * knowledge graph layer to rank MemoryNode importance. Not required by the
 * forecasting pipeline but kept here as a general-purpose graph primitive.
 */
export function pageRank(
  adjacency: Record<string, Record<string, number>>,
  damping = 0.85,
  iterations = 50,
): Record<string, number> {
  const nodes = Object.keys(adjacency);
  const n = nodes.length;
  if (n === 0) return {};

  let ranks: Record<string, number> = {};
  for (const node of nodes) ranks[node] = 1 / n;

  const outWeightSum: Record<string, number> = {};
  for (const node of nodes) {
    outWeightSum[node] = Object.values(adjacency[node] ?? {}).reduce(
      (a, b) => a + b,
      0,
    );
  }

  for (let iter = 0; iter < iterations; iter++) {
    const next: Record<string, number> = {};
    for (const node of nodes) next[node] = (1 - damping) / n;

    for (const source of nodes) {
      const edges = adjacency[source] ?? {};
      const total = outWeightSum[source];
      if (total <= 0) {
        // Dangling node: distribute its rank evenly.
        for (const node of nodes) {
          next[node] += (damping * ranks[source]) / n;
        }
        continue;
      }
      for (const [target, weight] of Object.entries(edges)) {
        if (!(target in ranks)) continue;
        next[target] += damping * ranks[source] * (weight / total);
      }
    }

    ranks = next;
  }

  return ranks;
}
