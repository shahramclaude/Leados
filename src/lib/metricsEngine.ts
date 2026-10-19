import { mean, stdDev, zScore } from "./math";
import { olsRegression, pearsonCorrelation, detectSeasonality, rollingStats } from "./stats";
import type { ForecastMethod } from "./types";

// ---------------------------------------------------------------------------
// metricsEngine.ts — THE forecasting / anomaly-detection / correlation core.
//
// Every exported function below is consumed directly by
// `src/lib/metricsIntelligence.ts` (the Part 9 orchestration layer). There
// are no orphaned exports in this file — each one is quoted by name at its
// call site in metricsIntelligence.ts.
//
// Exported functions:
//   - simpleExponentialSmoothing(series, alpha, horizon)        -> used
//   - doubleExponentialSmoothing(series, alpha, beta, horizon)  -> used
//   - holtWintersForecast(series, period, alpha, beta, gamma, horizon) -> used
//   - selectForecastMethod(series)                              -> used
//   - computeMAPEAccuracy(actual, predicted)                    -> used
//   - computeZScoreAnomalies(values, windowSize, zThreshold)    -> used
//   - computeCUSUM(values, kMultiplier, hMultiplier, windowSize)-> used
//   - buildCorrelationPairs(seriesMap)                          -> used
//   - crossCorrelationAtLag(a, b, lag)                          -> used
// ---------------------------------------------------------------------------

export interface SmoothingResult {
  /** one-step-ahead in-sample fitted values, same length as input series */
  fitted: number[];
  /** `horizon` future point forecasts */
  forecast: number[];
}

/**
 * Simple exponential smoothing (Brown, 1956 style single smoothing).
 * Level_t = alpha*y_t + (1-alpha)*Level_{t-1}
 * Forecast is flat at the final level for the whole horizon — appropriate
 * when no trend or seasonality is detected.
 * DESIGN PARAMETER: alpha (smoothing factor), default 0.3.
 */
export function simpleExponentialSmoothing(
  series: number[],
  alpha = 0.3,
  horizon = 90,
): SmoothingResult {
  const n = series.length;
  const fitted: number[] = [];
  if (n === 0) return { fitted: [], forecast: [] };

  let level = series[0];
  fitted.push(level);
  for (let t = 1; t < n; t++) {
    const prediction = level;
    fitted.push(prediction);
    level = alpha * series[t] + (1 - alpha) * level;
  }

  const forecast = new Array(horizon).fill(level);
  return { fitted, forecast };
}

/**
 * Double exponential smoothing — Holt's linear trend method (Holt, 1957).
 *   Level_t = alpha*y_t + (1-alpha)*(Level_{t-1} + Trend_{t-1})
 *   Trend_t = beta*(Level_t - Level_{t-1}) + (1-beta)*Trend_{t-1}
 *   Forecast_{t+h} = Level_t + h*Trend_t
 * DESIGN PARAMETERS: alpha=0.3, beta=0.1 (defaults).
 */
export function doubleExponentialSmoothing(
  series: number[],
  alpha = 0.3,
  beta = 0.1,
  horizon = 90,
): SmoothingResult {
  const n = series.length;
  if (n === 0) return { fitted: [], forecast: [] };
  if (n === 1) {
    return { fitted: [series[0]], forecast: new Array(horizon).fill(series[0]) };
  }

  let level = series[0];
  let trend = series[1] - series[0];
  const fitted: number[] = [level];

  for (let t = 1; t < n; t++) {
    const prediction = level + trend;
    fitted.push(prediction);
    const prevLevel = level;
    level = alpha * series[t] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  const forecast: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    forecast.push(level + h * trend);
  }

  return { fitted, forecast };
}

/**
 * Holt-Winters triple exponential smoothing (Holt, 1957; Winters, 1960),
 * multiplicative seasonality variant, exactly per the formulas specified:
 *   Level: L_t = α(y_t/S_{t-m}) + (1-α)(L_{t-1}+b_{t-1})
 *   Trend: b_t = β(L_t-L_{t-1}) + (1-β)b_{t-1}
 *   Season: S_t = γ(y_t/L_t) + (1-γ)S_{t-m}
 *   Forecast: ŷ_{t+h} = (L_t + h*b_t) * S_{t+h-m}
 * DESIGN PARAMETERS: alpha=0.3, beta=0.1, gamma=0.2 (defaults).
 */
export function holtWintersForecast(
  series: number[],
  period: number,
  alpha = 0.3,
  beta = 0.1,
  gamma = 0.2,
  horizon = 90,
): SmoothingResult {
  const n = series.length;
  if (period < 2 || n < period * 2) {
    // Not enough data for two full seasonal cycles — fall back.
    return doubleExponentialSmoothing(series, alpha, beta, horizon);
  }

  // Initialize level as the mean of the first season, trend as the average
  // seasonal-over-seasonal slope, and seasonal indices from the first cycle.
  const firstCycle = series.slice(0, period);
  const secondCycle = series.slice(period, period * 2);
  let level = mean(firstCycle);
  let trend = (mean(secondCycle) - mean(firstCycle)) / period;

  const seasonal: number[] = firstCycle.map((v) => (level === 0 ? 1 : v / level));

  const fitted: number[] = [];
  const seasonalHistory: number[] = [...seasonal];

  for (let t = 0; t < n; t++) {
    const seasonIdx = t % period;
    const s = seasonalHistory[t] ?? seasonalHistory[seasonIdx] ?? 1;
    const prediction = (level + trend) * (s === 0 ? 1 : s);
    fitted.push(prediction);

    const y = series[t];
    const prevLevel = level;
    const seasonComponent = s === 0 ? 1 : s;
    level = alpha * (y / seasonComponent) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    const newSeason = level === 0 ? 1 : gamma * (y / level) + (1 - gamma) * seasonComponent;
    seasonalHistory.push(newSeason);
  }

  const forecast: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    const seasonIdx = (n + h - 1) % period;
    // Use the most recently estimated seasonal index for that phase.
    const recentSeasonalForPhase = seasonalHistory
      .filter((_, idx) => idx % period === seasonIdx)
      .slice(-1)[0] ?? 1;
    forecast.push((level + h * trend) * recentSeasonalForPhase);
  }

  return { fitted, forecast };
}

export interface MethodSelection {
  method: ForecastMethod;
  seasonalPeriod?: number;
  r2: number;
}

/**
 * Method selection per Part 9 spec:
 *  - seasonality signal (Fourier amplitude > noise threshold) -> Holt-Winters
 *  - else OLS R² > 0.5 (trend detected) -> double exponential smoothing
 *  - else -> simple exponential smoothing
 */
export function selectForecastMethod(series: number[]): MethodSelection {
  const seasonality = detectSeasonality(series);
  if (seasonality.hasSeasonality) {
    return { method: "holt-winters", seasonalPeriod: seasonality.period, r2: 0 };
  }

  const ols = olsRegression(series);
  if (ols.r2 > 0.5) {
    return { method: "double-exponential", r2: ols.r2 };
  }

  return { method: "simple-exponential", r2: ols.r2 };
}

/**
 * MAPE-based accuracy score per spec:
 *   MAPE = mean(|actual - predicted| / |actual|) * 100
 *   accuracy = clamp(100 - MAPE, 0, 100)
 */
export function computeMAPEAccuracy(
  actual: number[],
  predicted: number[],
): { mape: number; accuracy: number } {
  const n = Math.min(actual.length, predicted.length);
  if (n === 0) return { mape: 0, accuracy: 0 };

  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (actual[i] === 0) continue;
    sum += Math.abs(actual[i] - predicted[i]) / Math.abs(actual[i]);
    count++;
  }

  const mape = count === 0 ? 0 : (sum / count) * 100;
  const accuracy = Math.max(0, Math.min(100, 100 - mape));
  return { mape, accuracy };
}

export interface PointAnomalyResult {
  index: number;
  value: number;
  expected: number;
  z: number;
}

/**
 * Method 1 — Z-score point anomaly detection. For each point, compute the
 * z-score against the trailing rolling window (default 90 points, treated as
 * a 90-day window since metric values are recorded at ~daily cadence).
 * BREACH if |z| > zThreshold (default 2.5).
 */
export function computeZScoreAnomalies(
  values: number[],
  windowSize = 90,
  zThreshold = 2.5,
): PointAnomalyResult[] {
  const results: PointAnomalyResult[] = [];
  for (let t = 1; t < values.length; t++) {
    const window = rollingStats(values, t, windowSize);
    if (window.stdDev === 0) continue;
    const z = zScore(values[t], window.mean, window.stdDev);
    if (Math.abs(z) > zThreshold) {
      results.push({ index: t, value: values[t], expected: window.mean, z });
    }
  }
  return results;
}

export interface CUSUMResult {
  index: number;
  value: number;
  sHigh: number;
  sLow: number;
  threshold: number;
  breach: boolean;
}

/**
 * Method 2 — Tabular CUSUM structural break detection (Page, 1954).
 *   S_high_t = max(0, S_high_{t-1} + (x_t - μ - k))
 *   S_low_t  = max(0, S_low_{t-1} + (μ - k - x_t))
 *   BREACH if S_high or S_low > h
 * μ, σ are recomputed from the trailing `windowSize` points (default 90,
 * i.e. a 90-day rolling mean/stdDev) at every step so the baseline adapts
 * over time. DESIGN PARAMETERS (Hawkins & Olwell, 1998, recommended
 * industrial SPC defaults): k = 0.5σ (slack), h = 4σ (threshold).
 */
export function computeCUSUM(
  values: number[],
  kMultiplier = 0.5,
  hMultiplier = 4,
  windowSize = 90,
): CUSUMResult[] {
  const results: CUSUMResult[] = [];
  let sHigh = 0;
  let sLow = 0;

  for (let t = 1; t < values.length; t++) {
    const window = rollingStats(values, t, windowSize);
    const sigma = window.stdDev;
    if (sigma === 0) {
      results.push({ index: t, value: values[t], sHigh, sLow, threshold: 0, breach: false });
      continue;
    }
    const k = kMultiplier * sigma;
    const h = hMultiplier * sigma;
    sHigh = Math.max(0, sHigh + (values[t] - window.mean - k));
    sLow = Math.max(0, sLow + (window.mean - k - values[t]));
    const breach = sHigh > h || sLow > h;
    results.push({ index: t, value: values[t], sHigh, sLow, threshold: h, breach });
    if (breach) {
      // Reset accumulators after a detected break so subsequent breaches are
      // independent events (standard practice in SPC monitoring).
      sHigh = 0;
      sLow = 0;
    }
  }

  return results;
}

export interface SeriesPoint {
  date: Date;
  value: number;
}

export interface CorrelationPairRaw {
  metricA: string;
  metricB: string;
  r: number;
  n: number;
}

/**
 * Builds the full pairwise Pearson correlation matrix across a map of
 * metricKey -> aligned daily series (same length, same date grid expected —
 * see metricsIntelligence.ts::alignToDailyGrid). Pearson formula lives in
 * stats.ts::pearsonCorrelation (standard textbook derivation).
 */
export function buildCorrelationPairs(
  seriesMap: Record<string, number[]>,
): CorrelationPairRaw[] {
  const keys = Object.keys(seriesMap);
  const pairs: CorrelationPairRaw[] = [];

  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = seriesMap[keys[i]];
      const b = seriesMap[keys[j]];
      const n = Math.min(a.length, b.length);
      if (n < 10) continue;
      const r = pearsonCorrelation(a.slice(0, n), b.slice(0, n));
      pairs.push({ metricA: keys[i], metricB: keys[j], r, n });
    }
  }

  return pairs;
}

/**
 * Cross-correlation of `a` leading `b` by `lagDays`: correlates a[t] with
 * b[t + lagDays]. Positive lag tests whether `a` is a leading indicator of
 * `b`. Uses stats.ts::pearsonCorrelation under the hood.
 */
export function crossCorrelationAtLag(
  a: number[],
  b: number[],
  lagDays: number,
): number {
  if (lagDays <= 0 || lagDays >= b.length) return pearsonCorrelation(a, b);
  const aSlice = a.slice(0, a.length - lagDays);
  const bSlice = b.slice(lagDays);
  const n = Math.min(aSlice.length, bSlice.length);
  if (n < 10) return 0;
  return pearsonCorrelation(aSlice.slice(0, n), bSlice.slice(0, n));
}

export { stdDev as engineStdDev };
