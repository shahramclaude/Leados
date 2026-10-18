// Statistical / graph primitives used across the intelligence engine.
// Every formula below cites its source equation so reviewers can check the
// implementation against the reference definition.

/**
 * Population z-score.
 * Source: z = (x - mu) / sigma  (standard score, Wikipedia "Standard score")
 */
export function zScore(x: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (x - mean) / stdDev;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

/**
 * Mean Absolute Percentage Error.
 * Source: MAPE = (100/n) * sum(|A_t - F_t| / |A_t|)
 * (Hyndman & Koehler, "Another look at measures of forecast accuracy", 2006)
 * Here used as a single-point deviation: |actual - target| / |target| * 100.
 */
export function mapePoint(actual: number, target: number): number | null {
  if (target === 0) return null;
  return (Math.abs(actual - target) / Math.abs(target)) * 100;
}

/**
 * Brier score for probabilistic forecast calibration.
 * Source: BS = (1/N) * sum((f_i - o_i)^2)
 * (Brier, G.W. "Verification of forecasts expressed in terms of probability", 1950)
 * f_i = forecast probability in [0,1], o_i = actual outcome in {0,1}.
 * Lower is better (0 = perfect calibration, 1 = worst).
 */
export function brierScore(pairs: Array<{ forecast: number; outcome: 0 | 1 }>): number | null {
  if (pairs.length === 0) return null;
  const sum = pairs.reduce((acc, p) => acc + (p.forecast - p.outcome) ** 2, 0);
  return sum / pairs.length;
}

export interface WeightedGraphInput {
  nodeIds: string[];
  edges: Array<{ source: string; target: string; weight?: number }>;
}

/**
 * PageRank (power-iteration method).
 * Source: PR(p) = (1-d)/N + d * sum_{q in in(p)} PR(q)/L(q)
 * (Page, L. & Brin, S. "The PageRank Citation Ranking", 1998)
 * d = damping factor (0.85, as in the original paper), L(q) = out-degree of q.
 * Graph is treated as undirected by inserting edges in both directions,
 * which is the standard adaptation for organizational / knowledge graphs.
 */
export function pageRank(input: WeightedGraphInput, damping = 0.85, iterations = 50): Map<string, number> {
  const { nodeIds, edges } = input;
  const n = nodeIds.length;
  const scores = new Map<string, number>();
  if (n === 0) return scores;

  nodeIds.forEach((id) => scores.set(id, 1 / n));

  const outWeight = new Map<string, number>();
  const incoming = new Map<string, Array<{ id: string; weight: number }>>();
  nodeIds.forEach((id) => {
    outWeight.set(id, 0);
    incoming.set(id, []);
  });

  // Undirected adaptation: each edge contributes to both directions.
  for (const e of edges) {
    const w = e.weight ?? 1;
    if (!scores.has(e.source) || !scores.has(e.target)) continue;
    outWeight.set(e.source, (outWeight.get(e.source) ?? 0) + w);
    outWeight.set(e.target, (outWeight.get(e.target) ?? 0) + w);
    incoming.get(e.target)?.push({ id: e.source, weight: w });
    incoming.get(e.source)?.push({ id: e.target, weight: w });
  }

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Map<string, number>();
    let danglingSum = 0;
    nodeIds.forEach((id) => {
      if ((outWeight.get(id) ?? 0) === 0) {
        danglingSum += scores.get(id) ?? 0;
      }
    });

    nodeIds.forEach((id) => {
      let incomingSum = 0;
      for (const { id: srcId, weight } of incoming.get(id) ?? []) {
        const srcOut = outWeight.get(srcId) ?? 0;
        if (srcOut > 0) {
          incomingSum += ((scores.get(srcId) ?? 0) * weight) / srcOut;
        }
      }
      const base = (1 - damping) / n;
      const dangling = damping * (danglingSum / n);
      next.set(id, base + dangling + damping * incomingSum);
    });

    next.forEach((v, k) => scores.set(k, v));
  }

  // Normalize to [0,1] range for display purposes.
  const max = Math.max(...Array.from(scores.values()), 1e-9);
  scores.forEach((v, k) => scores.set(k, max > 0 ? v / max : 0));
  return scores;
}

/**
 * Exponential recency weighting used for trend detection on short series.
 * weight_i = decay^(n-1-i), most recent sample gets weight 1.
 */
export function weightedTrend(values: number[], decay = 0.7): "up" | "down" | "flat" {
  if (values.length < 2) return "flat";
  const diffs: number[] = [];
  for (let i = 1; i < values.length; i++) diffs.push(values[i] - values[i - 1]);
  let weightedSum = 0;
  let weightTotal = 0;
  const n = diffs.length;
  diffs.forEach((d, i) => {
    const w = Math.pow(decay, n - 1 - i);
    weightedSum += d * w;
    weightTotal += w;
  });
  const avg = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const scale = Math.max(stdDev(values), 1e-6);
  if (avg > scale * 0.15) return "up";
  if (avg < -scale * 0.15) return "down";
  return "flat";
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
