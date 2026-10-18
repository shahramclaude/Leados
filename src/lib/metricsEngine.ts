// Metrics Engine
// ---------------------------------------------------------------------------
// Pure, framework-free statistics used to turn raw metric time series into
// business intelligence: health status, forecasts, anomalies and
// cross-metric correlations. No external stats/charting libraries.
// ---------------------------------------------------------------------------

export interface MetricPoint {
  date: Date;
  value: number;
}

export interface MetricMeta {
  target?: number | null;
  benchmark?: number | null;
  unit?: string | null;
  displayName?: string | null;
}

export type HealthStatus = "green" | "yellow" | "red";
export type Trend = "up" | "flat" | "down";

export interface MetricHealth {
  status: HealthStatus;
  trend: Trend;
  vsTarget: number; // % difference vs target, positive = above target
  vsBenchmark: number; // % difference vs benchmark, positive = above benchmark
  momentum: number; // acceleration of the trend, normalized
  explanation: string;
}

export type ForecastMethod = "linear" | "exponential_smoothing" | "holt_winters";

export interface ForecastValue {
  date: string;
  p10: number;
  p50: number;
  p90: number;
}

export interface Forecast {
  values: ForecastValue[];
  method: ForecastMethod;
  accuracy: number; // 0-100, higher is better (100 - MAPE, clamped)
}

export type AnomalyType = "point" | "structural_break";

export interface Anomaly {
  key?: string;
  at: Date;
  value: number;
  expected: number;
  zScore: number;
  type: AnomalyType;
  severity: number; // |zScore| (point) or normalized CUSUM magnitude (structural)
}

export interface CorrelationPair {
  a: string;
  b: string;
  pearson: number;
  spearman: number;
  n: number;
  flagged: boolean;
}

export interface CorrelationMatrix {
  keys: string[];
  pearson: number[][];
  spearman: number[][];
  pairs: CorrelationPair[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Basic stats helpers
// ---------------------------------------------------------------------------

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

function sortByDate(history: MetricPoint[]): MetricPoint[] {
  return [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function pct(a: number, b: number): number {
  if (!Number.isFinite(b) || b === 0) return 0;
  return ((a - b) / Math.abs(b)) * 100;
}

/**
 * Lower-is-better metrics (cost, churn, defects, errors, risk, latency...)
 * invert the "good direction" so health/vsTarget read correctly.
 */
function inferDirection(key: string): "higher_better" | "lower_better" {
  const k = key.toLowerCase();
  const lowerBetterHints = [
    "cost",
    "churn",
    "defect",
    "bug",
    "error",
    "latency",
    "downtime",
    "debt",
    "risk",
    "attrition",
    "complaint",
    "incident",
    "turnover",
    "burn",
    "delay",
    "overdue",
    "spend",
  ];
  return lowerBetterHints.some((h) => k.includes(h)) ? "lower_better" : "higher_better";
}

function linregSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xs = values.map((_, i) => i);
  const mx = mean(xs);
  const my = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (values[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// ---------------------------------------------------------------------------
// computeMetricHealth
// ---------------------------------------------------------------------------

export function computeMetricHealth(key: string, history: MetricPoint[], meta: MetricMeta = {}): MetricHealth {
  const sorted = sortByDate(history);
  if (!sorted.length) {
    return {
      status: "yellow",
      trend: "flat",
      vsTarget: 0,
      vsBenchmark: 0,
      momentum: 0,
      explanation: `No readings logged yet for ${meta.displayName ?? key}.`,
    };
  }

  const direction = inferDirection(key);
  const current = sorted[sorted.length - 1].value;

  const window12 = sorted.slice(-12).map((p) => p.value);
  const mean12 = mean(window12);
  const std12 = stdDev(window12);
  const deviation = current - mean12;
  const rollingZ = std12 > 0 ? deviation / std12 : 0;

  // Trend: slope of the last up-to-6 points, normalized by the rolling mean.
  const trendWindow = sorted.slice(-6).map((p) => p.value);
  const slope = linregSlope(trendWindow);
  const slopePct = mean12 !== 0 ? (slope / Math.abs(mean12)) * 100 : 0;
  let trend: Trend = "flat";
  if (slopePct > 2) trend = "up";
  else if (slopePct < -2) trend = "down";

  // Momentum: compare recent slope half vs earlier slope half (acceleration).
  const half = Math.max(2, Math.floor(trendWindow.length / 2));
  const earlySlope = linregSlope(trendWindow.slice(0, half));
  const lateSlope = linregSlope(trendWindow.slice(-half));
  const momentum = mean12 !== 0 ? ((lateSlope - earlySlope) / Math.abs(mean12)) * 100 : 0;

  const vsTarget = meta.target != null ? pct(current, meta.target) : 0;
  const vsBenchmark = meta.benchmark != null ? pct(current, meta.benchmark) : 0;

  const signedVsTarget = direction === "lower_better" ? -vsTarget : vsTarget;
  const isWorseThanTarget = meta.target != null && signedVsTarget < 0;
  const isStatOutlier = std12 > 0 && Math.abs(deviation) > 1.5 * std12;
  // A stat-outlier only counts against health if it's moving in the bad
  // direction relative to the rolling mean.
  const outlierIsBad = direction === "lower_better" ? deviation > 0 : deviation < 0;

  let status: HealthStatus = "green";
  const redCondition = isStatOutlier && outlierIsBad && isWorseThanTarget;
  const yellowCondition = (isStatOutlier && outlierIsBad) || isWorseThanTarget;
  if (redCondition) status = "red";
  else if (yellowCondition) status = "yellow";

  const unit = meta.unit ? ` ${meta.unit}` : "";
  const name = meta.displayName ?? key;
  const trendWord = trend === "up" ? "trending up" : trend === "down" ? "trending down" : "holding flat";
  const targetClause =
    meta.target != null
      ? `${signedVsTarget >= 0 ? "above" : "below"} target by ${Math.abs(vsTarget).toFixed(1)}%`
      : "no target set";
  const benchmarkClause =
    meta.benchmark != null
      ? `, ${vsBenchmark >= 0 ? "ahead of" : "behind"} benchmark by ${Math.abs(vsBenchmark).toFixed(1)}%`
      : "";
  const soWhat =
    status === "red"
      ? "This needs attention now."
      : status === "yellow"
        ? "Worth watching closely."
        : "Healthy — no action needed.";

  const explanation = `${name} is ${current.toFixed(2)}${unit}, ${trendWord} over recent periods and ${targetClause}${benchmarkClause}. ${soWhat}`;

  return {
    status,
    trend,
    vsTarget: Math.round(vsTarget * 10) / 10,
    vsBenchmark: Math.round(vsBenchmark * 10) / 10,
    momentum: Math.round(momentum * 10) / 10,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Forecasting: linear, exponential smoothing, Holt-Winters (with fallback to
// Holt's linear trend when there isn't enough data for a full season).
// ---------------------------------------------------------------------------

function forecastLinear(values: number[], steps: number): number[] {
  const n = values.length;
  const xs = values.map((_, i) => i);
  const mx = mean(xs);
  const my = mean(values);
  const slope = linregSlope(values);
  const intercept = my - slope * mx;
  const out: number[] = [];
  for (let h = 1; h <= steps; h++) {
    out.push(intercept + slope * (n - 1 + h));
  }
  return out;
}

function fitExponentialSmoothing(values: number[], alpha = 0.3): number[] {
  const level: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    level.push(alpha * values[i] + (1 - alpha) * level[i - 1]);
  }
  return level;
}

function forecastExponentialSmoothing(values: number[], steps: number, alpha = 0.3): number[] {
  const level = fitExponentialSmoothing(values, alpha);
  const last = level[level.length - 1];
  return new Array(steps).fill(last);
}

/** Holt's linear trend method (double exponential smoothing). */
function holtLinear(values: number[], alpha = 0.4, beta = 0.2) {
  let level = values[0];
  let trend = values.length > 1 ? values[1] - values[0] : 0;
  const levels: number[] = [level];
  const trends: number[] = [trend];
  for (let i = 1; i < values.length; i++) {
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    levels.push(level);
    trends.push(trend);
  }
  return { level, trend, levels, trends };
}

function forecastHoltWinters(values: number[], steps: number): number[] {
  const period = 7;
  const seasonal = values.length >= period * 2;
  if (!seasonal) {
    const { level, trend } = holtLinear(values);
    const out: number[] = [];
    for (let h = 1; h <= steps; h++) out.push(level + h * trend);
    return out;
  }

  // Additive Holt-Winters with a weekly-style seasonal period.
  const alpha = 0.3;
  const beta = 0.1;
  const gamma = 0.2;
  const seasons = Math.floor(values.length / period);
  const seasonAverages: number[] = [];
  for (let s = 0; s < seasons; s++) {
    seasonAverages.push(mean(values.slice(s * period, (s + 1) * period)));
  }
  let level = mean(seasonAverages.slice(0, 1).length ? values.slice(0, period) : values);
  let trend =
    seasons > 1 ? (mean(values.slice(period, period * 2)) - mean(values.slice(0, period))) / period : 0;
  const seasonal_: number[] = [];
  for (let i = 0; i < period; i++) {
    seasonal_.push(values[i] - level);
  }

  const n = values.length;
  const levels = [level];
  const trends = [trend];
  const seasonals = [...seasonal_];

  for (let i = period; i < n; i++) {
    const seasonIdx = i % period;
    const prevLevel = levels[levels.length - 1];
    const prevTrend = trends[trends.length - 1];
    const prevSeasonal = seasonals[i - period];
    const newLevel = alpha * (values[i] - prevSeasonal) + (1 - alpha) * (prevLevel + prevTrend);
    const newTrend = beta * (newLevel - prevLevel) + (1 - beta) * prevTrend;
    const newSeasonal = gamma * (values[i] - newLevel) + (1 - gamma) * prevSeasonal;
    levels.push(newLevel);
    trends.push(newTrend);
    seasonals.push(newSeasonal);
    void seasonIdx;
  }

  const finalLevel = levels[levels.length - 1];
  const finalTrend = trends[trends.length - 1];
  const out: number[] = [];
  for (let h = 1; h <= steps; h++) {
    const seasonalComponent = seasonals[seasonals.length - period + ((h - 1) % period)] ?? 0;
    out.push(finalLevel + h * finalTrend + seasonalComponent);
  }
  return out;
}

function mape(actual: number[], predicted: number[]): number {
  const errs: number[] = [];
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] === 0) continue;
    errs.push(Math.abs((actual[i] - predicted[i]) / actual[i]));
  }
  if (!errs.length) return 100;
  return mean(errs) * 100;
}

export function forecastMetric(key: string, history: MetricPoint[], horizonDays: number): Forecast {
  const sorted = sortByDate(history);
  const values = sorted.map((p) => p.value);
  void key;

  if (values.length < 2) {
    const last = values[0] ?? 0;
    const lastDate = sorted[0]?.date ?? new Date();
    const out: ForecastValue[] = [];
    for (let h = 1; h <= horizonDays; h++) {
      out.push({
        date: new Date(lastDate.getTime() + h * DAY_MS).toISOString(),
        p10: last,
        p50: last,
        p90: last,
      });
    }
    return { values: out, method: "linear", accuracy: 0 };
  }

  const holdoutSize = Math.max(1, Math.min(5, Math.floor(values.length * 0.2)));
  const trainSize = values.length - holdoutSize;
  const canHoldout = trainSize >= 2;

  const methods: { method: ForecastMethod; fn: (vals: number[], steps: number) => number[] }[] = [
    { method: "linear", fn: forecastLinear },
    { method: "exponential_smoothing", fn: (v, s) => forecastExponentialSmoothing(v, s) },
    { method: "holt_winters", fn: forecastHoltWinters },
  ];

  let bestMethod: ForecastMethod = "linear";
  let bestMape = Infinity;
  let bestAccuracy = 0;

  if (canHoldout) {
    const train = values.slice(0, trainSize);
    const actualHoldout = values.slice(trainSize);
    for (const { method, fn } of methods) {
      try {
        const predicted = fn(train, actualHoldout.length);
        const m = mape(actualHoldout, predicted);
        if (Number.isFinite(m) && m < bestMape) {
          bestMape = m;
          bestMethod = method;
        }
      } catch {
        // skip a method that fails on this series
      }
    }
    bestAccuracy = Math.max(0, Math.min(100, 100 - bestMape));
  } else {
    bestMethod = "linear";
    bestAccuracy = 0;
  }

  const chosen = methods.find((m) => m.method === bestMethod) ?? methods[0];
  const pointForecast = chosen.fn(values, horizonDays);

  // Residual std from the training fit, used to widen the confidence band
  // the further out we forecast (grows with sqrt(h)).
  const residuals: number[] = [];
  for (let i = 1; i < values.length; i++) {
    residuals.push(values[i] - values[i - 1]);
  }
  const residualStd = stdDev(residuals) || stdDev(values) * 0.1 || Math.abs(mean(values)) * 0.05 || 1;
  const z90 = 1.2816;

  const lastDate = sorted[sorted.length - 1].date;
  const out: ForecastValue[] = pointForecast.map((p50, idx) => {
    const h = idx + 1;
    const band = residualStd * z90 * Math.sqrt(h);
    return {
      date: new Date(lastDate.getTime() + h * DAY_MS).toISOString(),
      p10: p50 - band,
      p50,
      p90: p50 + band,
    };
  });

  return { values: out, method: bestMethod, accuracy: Math.round(bestAccuracy * 10) / 10 };
}

// ---------------------------------------------------------------------------
// Anomaly detection: z-score point anomalies + CUSUM structural breaks.
// ---------------------------------------------------------------------------

export function detectAnomalies(history: MetricPoint[]): Anomaly[] {
  const sorted = sortByDate(history);
  const anomalies: Anomaly[] = [];
  if (sorted.length < 4) return anomalies;

  const values = sorted.map((p) => p.value);

  // --- Point anomalies via rolling z-score -------------------------------
  const window = 12;
  for (let i = 0; i < sorted.length; i++) {
    const start = Math.max(0, i - window);
    const windowVals = values.slice(start, i); // exclude current point itself
    if (windowVals.length < 3) continue;
    const m = mean(windowVals);
    const sd = stdDev(windowVals);
    if (sd === 0) continue;
    const z = (values[i] - m) / sd;
    if (Math.abs(z) > 2.5) {
      anomalies.push({
        at: sorted[i].date,
        value: values[i],
        expected: m,
        zScore: Math.round(z * 100) / 100,
        type: "point",
        severity: Math.abs(z),
      });
    }
  }

  // --- Structural breaks via two-sided CUSUM ------------------------------
  const overallMean = mean(values);
  const overallStd = stdDev(values) || 1;
  const k = 0.5 * overallStd; // slack/allowance
  const h = 5 * overallStd; // decision threshold
  let sHigh = 0;
  let sLow = 0;
  for (let i = 0; i < values.length; i++) {
    const dev = values[i] - overallMean;
    sHigh = Math.max(0, sHigh + dev - k);
    sLow = Math.min(0, sLow + dev + k);
    if (sHigh > h || Math.abs(sLow) > h) {
      anomalies.push({
        at: sorted[i].date,
        value: values[i],
        expected: overallMean,
        zScore: Math.round(((values[i] - overallMean) / overallStd) * 100) / 100,
        type: "structural_break",
        severity: Math.max(sHigh, Math.abs(sLow)) / h,
      });
      sHigh = 0;
      sLow = 0;
    }
  }

  return anomalies.sort((a, b) => b.severity - a.severity);
}

// ---------------------------------------------------------------------------
// Correlations: Pearson + Spearman across all metric pairs.
// ---------------------------------------------------------------------------

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? 0 : num / den;
}

function rank(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let m = i; m <= j; m++) ranks[idx[m][1]] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function spearman(xs: number[], ys: number[]): number {
  if (xs.length < 2) return 0;
  return pearson(rank(xs), rank(ys));
}

/** Buckets a point series into day-granularity key -> value (last wins). */
function toDailyMap(history: MetricPoint[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of sortByDate(history)) {
    const day = p.date.toISOString().slice(0, 10);
    map.set(day, p.value);
  }
  return map;
}

export function computeCorrelations(keys: string[], historyByKey: Record<string, MetricPoint[]>): CorrelationMatrix {
  const n = keys.length;
  const pearsonM: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const spearmanM: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const pairs: CorrelationPair[] = [];

  const dailyMaps = keys.map((k) => toDailyMap(historyByKey[k] ?? []));

  for (let i = 0; i < n; i++) {
    pearsonM[i][i] = 1;
    spearmanM[i][i] = 1;
    for (let j = 0; j < i; j++) {
      const mapA = dailyMaps[i];
      const mapB = dailyMaps[j];
      const commonDays = [...mapA.keys()].filter((d) => mapB.has(d)).sort();
      let r = 0;
      let rho = 0;
      if (commonDays.length >= 3) {
        const xs = commonDays.map((d) => mapA.get(d) as number);
        const ys = commonDays.map((d) => mapB.get(d) as number);
        r = pearson(xs, ys);
        rho = spearman(xs, ys);
      }
      pearsonM[i][j] = Math.round(r * 1000) / 1000;
      pearsonM[j][i] = pearsonM[i][j];
      spearmanM[i][j] = Math.round(rho * 1000) / 1000;
      spearmanM[j][i] = spearmanM[i][j];
      pairs.push({
        a: keys[i],
        b: keys[j],
        pearson: pearsonM[i][j],
        spearman: spearmanM[i][j],
        n: commonDays.length,
        flagged: Math.abs(r) > 0.7,
      });
    }
  }

  pairs.sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson));

  return { keys, pearson: pearsonM, spearman: spearmanM, pairs };
}
