/**
 * src/lib/stats.ts
 * Statistics layered on mathUtils — used by the forecast summarizer to turn
 * a raw array of Monte Carlo replication outputs into p10/p50/p90 bands.
 */
import { mean, quantile, std, sum } from "./mathUtils";

export interface Distribution {
  n: number;
  mean: number;
  std: number;
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
}

export function summarizeDistribution(xs: number[]): Distribution {
  if (xs.length === 0) {
    return { n: 0, mean: NaN, std: NaN, p10: NaN, p50: NaN, p90: NaN, min: NaN, max: NaN };
  }
  return {
    n: xs.length,
    mean: mean(xs),
    std: xs.length > 1 ? std(xs) : 0,
    p10: quantile(xs, 0.1),
    p50: quantile(xs, 0.5),
    p90: quantile(xs, 0.9),
    min: Math.min(...xs),
    max: Math.max(...xs),
  };
}

/** Builds a fixed-bin histogram (for the forecast distribution chart) so the
 * client never has to receive the full N=2,000 replication array. */
export function histogram(xs: number[], bins = 24): { x0: number; x1: number; count: number }[] {
  if (xs.length === 0) return [];
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const width = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const x of xs) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((x - min) / width)));
    counts[idx]++;
  }
  return counts.map((count, i) => ({ x0: min + i * width, x1: min + (i + 1) * width, count }));
}

/** Weighted average attrition-risk score for a cohort, used in the Network
 * node coloring and the cockpit KPI cards. */
export function weightedRisk(scores: number[], weights: number[]): number {
  const wsum = sum(weights);
  if (wsum === 0) return NaN;
  return sum(scores.map((s, i) => s * weights[i])) / wsum;
}
