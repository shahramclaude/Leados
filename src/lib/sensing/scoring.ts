// Proper scoring rules + extremizing aggregation for the forecasting
// tournament.
//
// Probabilities are always clamped to [MIN_P, MAX_P] before scoring or
// storage. This is a deliberate anti-gaming measure: without a floor/ceiling,
// a forecaster can claim p=1 to get a free "perfect" Brier score of 0 on a
// win while a p=0.99 forecaster who hedged honestly looks worse, and p=0/1
// also makes log-loss blow up to +Infinity on a miss in a way that is easy
// to abuse by only ever forecasting on questions you are certain of and
// sitting out everything else (survivorship). Clamping bounds the maximum
// reward AND the maximum punishment.

export const MIN_P = 0.02;
export const MAX_P = 0.98;

export function clampProbability(p: number): number {
  return Math.min(MAX_P, Math.max(MIN_P, p));
}

/** Brier score: (p - outcome)^2. Lower is better. Range [0, 1]. */
export function brierScore(p: number, outcome: boolean): number {
  const clamped = clampProbability(p);
  const o = outcome ? 1 : 0;
  return (clamped - o) ** 2;
}

/** Log loss: -(o*ln(p) + (1-o)*ln(1-p)). Lower is better. */
export function logLoss(p: number, outcome: boolean): number {
  const clamped = clampProbability(p);
  const o = outcome ? 1 : 0;
  return -(o * Math.log(clamped) + (1 - o) * Math.log(1 - clamped));
}

/**
 * Extremizing aggregate (Satopaa et al. 2014 style):
 *   p' = clip( p^a / (p^a + (1-p)^a) )
 * applied to the simple average of a crowd's probabilities. a > 1 pushes the
 * aggregate away from 0.5 to correct for the fact that averaging opinions
 * formed on overlapping/independent partial information tends to be
 * under-confident. Default a = 1.5, documented and configurable.
 */
export function extremize(p: number, a = 1.5): number {
  const clamped = clampProbability(p);
  const pa = Math.pow(clamped, a);
  const qa = Math.pow(1 - clamped, a);
  return clampProbability(pa / (pa + qa));
}

export function crowdAggregate(probabilities: number[], a = 1.5): { mean: number; extremized: number } {
  if (probabilities.length === 0) return { mean: 0.5, extremized: 0.5 };
  const mean = probabilities.reduce((s, p) => s + p, 0) / probabilities.length;
  return { mean, extremized: extremize(mean, a) };
}

export interface CalibrationBucket {
  bucketLow: number;
  bucketHigh: number;
  count: number;
  avgForecast: number;
  observedFrequency: number;
}

/**
 * Calibration error: bucket forecasts into deciles, compare the average
 * forecast in each bucket to the observed outcome frequency in that bucket,
 * and report the mean absolute gap. 0 = perfectly calibrated.
 */
export function calibrationError(
  forecasts: { probability: number; outcome: boolean }[],
  buckets = 5,
): { error: number; buckets: CalibrationBucket[] } {
  if (forecasts.length === 0) return { error: 0, buckets: [] };
  const size = 1 / buckets;
  const bucketed: CalibrationBucket[] = [];
  let weightedAbsGap = 0;
  let total = 0;
  for (let b = 0; b < buckets; b++) {
    const low = b * size;
    const high = low + size;
    const inBucket = forecasts.filter((f) => {
      const p = clampProbability(f.probability);
      return b === buckets - 1 ? p >= low && p <= high : p >= low && p < high;
    });
    if (inBucket.length === 0) continue;
    const avgForecast = inBucket.reduce((s, f) => s + clampProbability(f.probability), 0) / inBucket.length;
    const observedFrequency = inBucket.filter((f) => f.outcome).length / inBucket.length;
    bucketed.push({ bucketLow: low, bucketHigh: high, count: inBucket.length, avgForecast, observedFrequency });
    weightedAbsGap += Math.abs(avgForecast - observedFrequency) * inBucket.length;
    total += inBucket.length;
  }
  return { error: total > 0 ? weightedAbsGap / total : 0, buckets: bucketed };
}
