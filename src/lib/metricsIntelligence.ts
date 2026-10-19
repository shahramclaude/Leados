import type { CalibrationPoint, CalibrationReport, CrossMetricHypothesis, ForecastResult, Hypothesis, StructuralBreak, TimeSeriesPoint } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// metricsIntelligence — Holt-Winters triple exponential smoothing, CUSUM
// structural break detection, Pearson cross-correlation, and calibration
// curve construction from hypothesis resolution history.
// Cite: Holt, C. C. (1957). "Forecasting seasonals and trends by
//   exponentially weighted moving averages." ONR Research Memorandum 52.
// Cite: Winters, P. R. (1960). "Forecasting sales by exponentially weighted
//   moving averages." Management Science, 6(3), 324-342.
// Cite: Page, E. S. (1954). "Continuous Inspection Schemes." Biometrika,
//   41(1/2), 100-115. (CUSUM)
// ─────────────────────────────────────────────────────────────────────────

// DESIGN PARAMETER: smoothing constants alpha=0.3 (level), beta=0.1 (trend),
// gamma=0.2 (seasonal), seasonal period = 7 (weekly) — textbook defaults.
export function holtWinters(
  series: TimeSeriesPoint[],
  alpha = 0.3,
  beta = 0.1,
  gamma = 0.2,
  period = 7,
  forecastHorizon = 7
): ForecastResult {
  if (series.length < period * 2) {
    const lastVal = series.length ? series[series.length - 1].value : 0;
    return {
      history: series,
      forecast: Array.from({ length: forecastHorizon }, (_, i) => ({
        ts: new Date(Date.now() + i * 86400000).toISOString(),
        value: lastVal,
      })),
      level: lastVal,
      trend: 0,
      seasonal: new Array(period).fill(0),
    };
  }

  const values = series.map((p) => p.value);
  // Initialize level/trend from the first two periods.
  const firstPeriodAvg = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const secondPeriodAvg = values.slice(period, period * 2).reduce((a, b) => a + b, 0) / period;
  let level = firstPeriodAvg;
  let trend = (secondPeriodAvg - firstPeriodAvg) / period;
  const seasonal = values.slice(0, period).map((v) => v - firstPeriodAvg);

  for (let t = 0; t < values.length; t++) {
    const seasonIdx = t % period;
    const prevLevel = level;
    const prevTrend = trend;
    const seasonalComponent = seasonal[seasonIdx];
    level = alpha * (values[t] - seasonalComponent) + (1 - alpha) * (prevLevel + prevTrend);
    trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;
    seasonal[seasonIdx] = gamma * (values[t] - level) + (1 - gamma) * seasonalComponent;
  }

  const lastTs = new Date(series[series.length - 1].ts).getTime();
  const forecast: TimeSeriesPoint[] = Array.from({ length: forecastHorizon }, (_, i) => {
    const m = i + 1;
    const seasonIdx = (values.length + i) % period;
    const value = level + m * trend + seasonal[seasonIdx];
    return { ts: new Date(lastTs + m * 86400000).toISOString(), value };
  });

  return { history: series, forecast, level, trend, seasonal };
}

/**
 * CUSUM structural break detection (Page, 1954). Tracks cumulative sum of
 * deviations from the running mean; flags a break when |S_t| exceeds a
 * threshold h = k * stdev. DESIGN PARAMETER: k (sensitivity) = 4,
 * drift allowance delta = 0.5 * stdev (standard tuning).
 */
export function detectStructuralBreaks(series: TimeSeriesPoint[], k = 4): StructuralBreak[] {
  if (series.length < 3) return [];
  const values = series.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const stdev = Math.sqrt(variance) || 1;
  const delta = 0.5 * stdev;
  const h = k * stdev;

  let sHigh = 0;
  let sLow = 0;
  return series.map((p, i) => {
    sHigh = Math.max(0, sHigh + (values[i] - mean - delta));
    sLow = Math.min(0, sLow + (values[i] - mean + delta));
    const cusumValue = Math.max(sHigh, Math.abs(sLow));
    return { index: i, ts: p.ts, cusumValue, isBreak: cusumValue > h };
  });
}

/** Pearson correlation coefficient (standard textbook derivation). */
export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  const ax = a.slice(0, n);
  const bx = b.slice(0, n);
  const meanA = ax.reduce((s, v) => s + v, 0) / n;
  const meanB = bx.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = ax[i] - meanA;
    const db = bx[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

/**
 * Cross-metric causal hypothesis generation: for each pair of metrics and
 * each lag in [0, maxLag], compute Pearson correlation of metricA at t and
 * metricB at t+lag. Report the lag with the strongest absolute correlation
 * above a significance threshold, as a candidate (not proven) hypothesis.
 */
export function buildCrossMetricHypotheses(
  metrics: Record<string, TimeSeriesPoint[]>,
  maxLag = 5,
  threshold = 0.5
): CrossMetricHypothesis[] {
  const keys = Object.keys(metrics).filter((k) => metrics[k].length >= maxLag + 5);
  const hypotheses: CrossMetricHypothesis[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      if (i === j) continue;
      const a = metrics[keys[i]].map((p) => p.value);
      const b = metrics[keys[j]].map((p) => p.value);
      let best = { lag: 0, corr: 0 };
      for (let lag = 0; lag <= maxLag; lag++) {
        const aSlice = a.slice(0, a.length - lag);
        const bSlice = b.slice(lag);
        const corr = pearsonCorrelation(aSlice, bSlice);
        if (Math.abs(corr) > Math.abs(best.corr)) best = { lag, corr };
      }
      if (Math.abs(best.corr) >= threshold) {
        hypotheses.push({
          metricA: keys[i],
          metricB: keys[j],
          lagDays: best.lag,
          correlation: best.corr,
          statement: `${keys[i]} leads ${keys[j]} by ${best.lag} day(s) with r=${best.corr.toFixed(2)} (correlational, not causal).`,
        });
      }
    }
  }
  return hypotheses.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, 10);
}

// DESIGN PARAMETER: per-cycle calibration weight adjustments are clamped to
// +/-10% of the current weight to avoid thrashing rule confidence scores.
export function clampCalibrationAdjustment(current: number, proposed: number, maxPctChange = 0.1): number {
  const maxDelta = Math.abs(current) * maxPctChange;
  const delta = Math.max(-maxDelta, Math.min(maxDelta, proposed - current));
  return current + delta;
}

// DESIGN PARAMETER: calibration status bands — good [0.6,0.85], over-sensitive
// <0.4, under-sensitive >0.9, insufficient data if resolved < 5.
export function buildCalibrationReport(ruleId: string, hypotheses: Hypothesis[]): CalibrationReport {
  const resolved = hypotheses.filter((h) => h.status !== "open");
  const confirmed = resolved.filter((h) => h.status === "confirmed").length;
  const refuted = resolved.length - confirmed;
  const confirmationRate = resolved.length ? confirmed / resolved.length : 0;

  const buckets = [0.2, 0.4, 0.6, 0.8, 1.0];
  const points: CalibrationPoint[] = buckets.map((bucket) => {
    const inBucket = resolved.filter((h) => h.confidence > bucket - 0.2 && h.confidence <= bucket);
    const confirmedInBucket = inBucket.filter((h) => h.status === "confirmed").length;
    return { predictedBucket: bucket, actualRate: inBucket.length ? confirmedInBucket / inBucket.length : 0, n: inBucket.length };
  });

  let status: CalibrationReport["status"] = "insufficient data";
  if (resolved.length >= 5) {
    if (confirmationRate < 0.4) status = "over-sensitive";
    else if (confirmationRate > 0.9) status = "under-sensitive";
    else if (confirmationRate >= 0.6 && confirmationRate <= 0.85) status = "good";
    else status = confirmationRate < 0.6 ? "over-sensitive" : "under-sensitive";
  }

  return { ruleId, points, status, predictions: hypotheses.length, confirmed, refuted, confirmationRate };
}
