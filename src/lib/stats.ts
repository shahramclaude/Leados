// src/lib/stats.ts
//
// Distribution summaries built on top of mathUtils.ts. Used by the forecast
// engine (src/lib/monteCarlo.ts) and the metrics view to turn a raw array of
// simulated outcomes into the handful of numbers a chart or KPI tile needs.
// Deliberately framework-free so it is cheap to unit test and safe to run
// inside a Web Worker.
import { mean, percentile, stddev } from "./mathUtils";

export interface DistributionSummary {
  n: number;
  mean: number;
  stddev: number;
  min: number;
  max: number;
  p10: number;
  p50: number;
  p90: number;
}

export function summarizeDistribution(values: number[]): DistributionSummary {
  if (values.length === 0) {
    return { n: 0, mean: 0, stddev: 0, min: 0, max: 0, p10: 0, p50: 0, p90: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    mean: +mean(sorted).toFixed(4),
    stddev: +stddev(sorted).toFixed(4),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p10: +percentile(sorted, 0.1).toFixed(4),
    p50: +percentile(sorted, 0.5).toFixed(4),
    p90: +percentile(sorted, 0.9).toFixed(4),
  };
}

export interface HistogramBucket {
  bucketStart: number;
  count: number;
}

/** Equal-width histogram across `bucketCount` buckets spanning [min, max]. */
export function buildHistogram(values: number[], bucketCount = 12): HistogramBucket[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const buckets = new Array(bucketCount).fill(0) as number[];
  for (const v of values) {
    let idx = Math.floor(((v - min) / span) * bucketCount);
    if (idx >= bucketCount) idx = bucketCount - 1;
    if (idx < 0) idx = 0;
    buckets[idx] += 1;
  }
  return buckets.map((count, i) => ({ bucketStart: +(min + (i * span) / bucketCount).toFixed(2), count }));
}
