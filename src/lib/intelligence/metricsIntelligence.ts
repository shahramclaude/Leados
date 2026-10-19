// src/lib/intelligence/metricsIntelligence.ts
//
// Derives features from raw metric time series for consumption by
// ruleEngine.ts, beliefFabric.ts observations, and predictiveScoring.ts.
// Pure functions only — no DB access — so they're trivially unit tested and
// reusable from both server code and the eval harness.
export interface MetricPoint {
  timestamp: string;
  value: number;
}

export function movingAverage(points: MetricPoint[], window: number): number | undefined {
  if (points.length === 0) return undefined;
  const slice = points.slice(-window);
  return slice.reduce((sum, p) => sum + p.value, 0) / slice.length;
}

/** Percent change between the average of the most recent `recentWindow`
 * points and the average of the `priorWindow` points immediately before
 * them. Used as a standard "trend" feature, e.g. usageTrend30d. */
export function percentChange(points: MetricPoint[], recentWindow: number, priorWindow: number): number | undefined {
  if (points.length < recentWindow + priorWindow) return undefined;
  const recent = points.slice(-recentWindow);
  const prior = points.slice(-(recentWindow + priorWindow), -recentWindow);
  const recentAvg = recent.reduce((s, p) => s + p.value, 0) / recent.length;
  const priorAvg = prior.reduce((s, p) => s + p.value, 0) / prior.length;
  if (priorAvg === 0) return undefined;
  return (recentAvg - priorAvg) / Math.abs(priorAvg);
}

/** Standard z-score of the latest point against the series' own mean/stdDev
 * — used to flag anomalies feeding signalFusion.ts. */
export function zScoreOfLatest(points: MetricPoint[]): number | undefined {
  if (points.length < 3) return undefined;
  const values = points.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return 0;
  return (values[values.length - 1] - mean) / sd;
}

/** Simple linear trend slope per day via least squares, used where a signed
 * rate of change (not just percent change) is a more natural feature. */
export function trendSlopePerDay(points: MetricPoint[]): number | undefined {
  if (points.length < 2) return undefined;
  const t0 = new Date(points[0].timestamp).getTime();
  const xs = points.map((p) => (new Date(p.timestamp).getTime() - t0) / 86_400_000);
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/** Builds a flat feature vector from a metrics map, for ruleEngine.ts. */
export function extractFeatures(metrics: Record<string, MetricPoint[]>): Record<string, number> {
  const features: Record<string, number> = {};
  for (const [name, points] of Object.entries(metrics)) {
    const latest = points[points.length - 1]?.value;
    if (latest !== undefined) features[`${name}.latest`] = latest;
    const trend = percentChange(points, 7, 7);
    if (trend !== undefined) features[`${name}.trend`] = trend;
    const z = zScoreOfLatest(points);
    if (z !== undefined) features[`${name}.z`] = z;
  }
  return features;
}
