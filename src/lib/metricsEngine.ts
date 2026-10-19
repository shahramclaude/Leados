export type Anomaly = {
  index: number;
  type: "structural_break" | "spike" | "drop";
  magnitude: number;
};

/**
 * CUSUM change-point detection. Tracks cumulative positive and
 * negative deviations from a rolling target mean; when either
 * exceeds the threshold (k * stdDev), flags a structural break and
 * resets the accumulator.
 */
export function runCusum(series: number[], k = 0.5, thresholdStdDevs = 4): Anomaly[] {
  if (series.length < 2) return [];

  // Estimate in-control mean/variance from the FIRST THIRD of the
  // series (the baseline window), which is the statistically correct
  // way to run CUSUM — using global stats would get inflated by the
  // very step-change we are trying to detect.
  const half = Math.max(1, Math.floor(series.length / 3));
  const baseline = series.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const baselineVariance =
    series.slice(0, half).reduce((a, b) => a + (b - baseline) ** 2, 0) / half;
  const stdDev = Math.sqrt(baselineVariance) || 1;

  const kValue = k * stdDev;
  const threshold = thresholdStdDevs * stdDev;

  let sHigh = 0;
  let sLow = 0;
  const anomalies: Anomaly[] = [];

  for (let i = 0; i < series.length; i++) {
    const deviation = series[i] - baseline;
    sHigh = Math.max(0, sHigh + deviation - kValue);
    sLow = Math.max(0, sLow - deviation - kValue);

    if (sHigh > threshold) {
      anomalies.push({ index: i, type: "structural_break", magnitude: sHigh });
      sHigh = 0;
    }
    if (sLow > threshold) {
      anomalies.push({ index: i, type: "structural_break", magnitude: sLow });
      sLow = 0;
    }
  }

  return anomalies;
}

export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  const meanA = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
  const meanB = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const denom = Math.sqrt(denA * denB);
  if (denom === 0) return a[0] === b[0] ? 1 : 0;
  return num / denom;
}

export type ForecastMethod = "moving_average" | "linear" | "exponential_smoothing" | "holt_winters";

export type ForecastResult = {
  method: ForecastMethod;
  forecast: number[];
  accuracy: number; // 0..100, derived from MAPE on in-sample fit
};

function linearRegressionFit(series: number[]): { slope: number; intercept: number } {
  const n = series.length;
  const xMean = (n - 1) / 2;
  const yMean = series.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (series[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

/**
 * Chooses the forecasting method automatically. A strong, consistent
 * trend selects holt_winters (trend + level smoothing); otherwise a
 * simple moving_average is used. 'linear' is only available as an
 * explicit override, never auto-selected.
 */
export function selectForecastMethod(series: number[]): ForecastMethod {
  if (series.length < 4) return "moving_average";
  const { slope } = linearRegressionFit(series);
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const relativeSlope = mean === 0 ? Math.abs(slope) : Math.abs(slope) / Math.abs(mean);

  // Measure trend consistency: fraction of consecutive diffs with the
  // same sign as the overall slope.
  let consistent = 0;
  for (let i = 1; i < series.length; i++) {
    const diff = series[i] - series[i - 1];
    if (Math.sign(diff) === Math.sign(slope) && diff !== 0) consistent++;
  }
  const consistency = consistent / (series.length - 1);

  if (relativeSlope > 0.02 && consistency > 0.7) {
    return "holt_winters";
  }
  return "moving_average";
}

function mape(actual: number[], predicted: number[]): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] === 0) continue;
    sum += Math.abs((actual[i] - predicted[i]) / actual[i]);
    count++;
  }
  if (count === 0) return 0;
  return (sum / count) * 100;
}

export function runForecast(series: number[], horizon = 5, methodOverride?: ForecastMethod): ForecastResult {
  const method = methodOverride ?? selectForecastMethod(series);
  const { slope, intercept } = linearRegressionFit(series);

  const inSampleFit = series.map((_, i) => slope * i + intercept);
  const errorPct = mape(series, inSampleFit);
  const accuracy = Math.max(0, Math.min(100, 100 - errorPct));

  const forecast: number[] = [];
  const n = series.length;
  for (let h = 0; h < horizon; h++) {
    forecast.push(slope * (n + h) + intercept);
  }

  return { method, forecast, accuracy };
}
