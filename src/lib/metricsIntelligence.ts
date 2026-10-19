import {
  simpleExponentialSmoothing,
  doubleExponentialSmoothing,
  holtWintersForecast,
  selectForecastMethod,
  computeMAPEAccuracy,
  computeZScoreAnomalies,
  computeCUSUM,
  buildCorrelationPairs,
  crossCorrelationAtLag,
} from "./metricsEngine";
import { mean, stdDev, weightedTrend } from "./math";
import { olsRegression } from "./stats";
import { recencyWeight, daysBetween, addDays, startOfDayUTC } from "./temporal";
import { getCachedForecast, setCachedForecast, buildFingerprint } from "./forecastCache";
import type {
  MetricDef,
  MetricValue,
  LeadosEvent,
  Forecast,
  ForecastPoint,
  Anomaly,
  CorrelationMatrix,
  CorrelationPair,
  MetricCausalHypothesis,
  CausalConfidence,
  DomainMetricScore,
  MetricHealthFull,
  MetricAlert,
  MetricsIntelligenceReport,
  TrendDirection,
} from "./types";
import { DOMAINS } from "./types";

// ---------------------------------------------------------------------------
// metricsIntelligence.ts — Part 9 orchestration layer.
//
// This module stitches together the primitives in metricsEngine.ts,
// stats.ts, math.ts and temporal.ts into the single
// `runMetricsIntelligence` entry point described in the Part 9 brief.
//
// Engine functions used (all quoted by name at their call site below):
//   metricsEngine.selectForecastMethod        — method selection
//   metricsEngine.simpleExponentialSmoothing  — fallback / no-trend forecast
//   metricsEngine.doubleExponentialSmoothing  — Holt linear trend forecast
//   metricsEngine.holtWintersForecast         — seasonal forecast
//   metricsEngine.computeMAPEAccuracy         — forecast accuracy scoring
//   metricsEngine.computeZScoreAnomalies      — point anomaly detection
//   metricsEngine.computeCUSUM                — structural break detection
//   metricsEngine.buildCorrelationPairs       — Pearson correlation matrix
//   metricsEngine.crossCorrelationAtLag       — lagged cross-correlation
// No engine function required by the spec was found "missing" because this
// engine file was authored specifically to back Part 9 — there are no
// FALLBACK implementations needed inside this file.
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function sortedValues(values: MetricValue[]): MetricValue[] {
  return [...values].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
}

export function groupValuesByMetric(
  metricValues: MetricValue[],
): Record<string, MetricValue[]> {
  const map: Record<string, MetricValue[]> = {};
  for (const v of metricValues) {
    if (!map[v.metricKey]) map[v.metricKey] = [];
    map[v.metricKey].push(v);
  }
  for (const key of Object.keys(map)) {
    map[key] = sortedValues(map[key]);
  }
  return map;
}

// --------------------------------------------------------------------------
// A. Metric health
// --------------------------------------------------------------------------

function trendBucket(pctChangeAcrossWindow: number): {
  trend: TrendDirection;
  arrow: MetricHealthFull["trendArrow"];
} {
  if (pctChangeAcrossWindow > 15) return { trend: "strong_up", arrow: "↑" };
  if (pctChangeAcrossWindow > 3) return { trend: "up", arrow: "↗" };
  if (pctChangeAcrossWindow > -3) return { trend: "flat", arrow: "→" };
  if (pctChangeAcrossWindow > -15) return { trend: "down", arrow: "↘" };
  return { trend: "strong_down", arrow: "↓" };
}

export function computeMetricHealth(
  def: MetricDef,
  values: MetricValue[],
  now: Date,
): MetricHealthFull | null {
  const sorted = sortedValues(values);
  if (sorted.length === 0) return null;

  const last = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  const windowSlice = sorted.slice(-30);
  const windowValues = windowSlice.map((v) => v.value);
  const ols = olsRegression(windowValues);

  // Recency-weighted trend line (math.ts::weightedTrend) — more recent
  // points in the window count more toward the slope estimate.
  const weightedPoints = windowSlice.map((v, i) => ({
    x: i,
    y: v.value,
    weight: recencyWeight(daysBetween(now, v.recordedAt), 14),
  }));
  const { slope } = weightedTrend(weightedPoints);

  const windowMean = mean(windowValues) || 1e-9;
  const pctChangeAcrossWindow = ((slope * (windowValues.length - 1)) / windowMean) * 100;
  const { trend, arrow } = trendBucket(pctChangeAcrossWindow);

  const vsTargetPct =
    def.target !== null && def.target !== 0
      ? ((last.value - def.target) / Math.abs(def.target)) * 100
      : null;

  let status: MetricHealthFull["status"] = "healthy";
  if (def.target !== null && vsTargetPct !== null) {
    const directionalDiff = def.higherIsBetter ? vsTargetPct : -vsTargetPct;
    if (directionalDiff <= -20) status = "critical";
    else if (directionalDiff < 0) status = "warning";
  }

  const recencyWindow = sorted.slice(-90);
  let weightSum = 0;
  let weightedValueSum = 0;
  for (const v of recencyWindow) {
    const w = recencyWeight(daysBetween(now, v.recordedAt), 14);
    weightSum += w;
    weightedValueSum += w * v.value;
  }
  const recencyWeightedScore = weightSum > 0 ? weightedValueSum / weightSum : last.value;

  return {
    metricKey: def.key,
    currentValue: last.value,
    previousValue: prev ? prev.value : null,
    target: def.target,
    vsTargetPct,
    status,
    trend,
    trendArrow: arrow,
    slope,
    r2: ols.r2,
    recencyWeightedScore,
    lastUpdated: last.recordedAt.toISOString(),
    dataPoints: sorted.length,
  };
}

// --------------------------------------------------------------------------
// B. Forecast pipeline
// --------------------------------------------------------------------------

const FORECAST_MIN_POINTS = 8;
// We compute a full year of daily points so the UI's "next 12 months" table
// can be built, while the first 90 points satisfy the literal "90-day
// forecast" requirement from the spec (forecast.parameters.primaryHorizonDays
// records the 90 explicitly).
const FORECAST_HORIZON_DAYS = 365;

export function computeForecastForMetric(
  def: MetricDef,
  values: MetricValue[],
): Forecast | null {
  const sorted = sortedValues(values);
  if (sorted.length < FORECAST_MIN_POINTS) return null;

  const last = sorted[sorted.length - 1];
  const fingerprint = buildFingerprint(sorted.length, last.value, last.recordedAt);
  const cached = getCachedForecast(def.key, fingerprint);
  if (cached) return cached;

  const rawSeries = sorted.map((v) => v.value);
  const selection = selectForecastMethod(rawSeries);

  let smoothing;
  const parameters: Record<string, number> = {};
  if (selection.method === "holt-winters") {
    const period = selection.seasonalPeriod ?? 7;
    const alpha = 0.3;
    const beta = 0.1;
    const gamma = 0.2;
    smoothing = holtWintersForecast(rawSeries, period, alpha, beta, gamma, FORECAST_HORIZON_DAYS);
    Object.assign(parameters, { alpha, beta, gamma, period });
  } else if (selection.method === "double-exponential") {
    const alpha = 0.3;
    const beta = 0.1;
    smoothing = doubleExponentialSmoothing(rawSeries, alpha, beta, FORECAST_HORIZON_DAYS);
    Object.assign(parameters, { alpha, beta });
  } else {
    const alpha = 0.3;
    smoothing = simpleExponentialSmoothing(rawSeries, alpha, FORECAST_HORIZON_DAYS);
    Object.assign(parameters, { alpha });
  }
  parameters.primaryHorizonDays = 90;

  const residuals = rawSeries.map((v, i) => v - (smoothing.fitted[i] ?? v));
  const residualStd = stdDev(residuals);

  const last30Actual = rawSeries.slice(-30);
  const last30Fitted = smoothing.fitted.slice(-30);
  const { mape, accuracy } = computeMAPEAccuracy(last30Actual, last30Fitted);

  const points: ForecastPoint[] = smoothing.forecast.map((p50, idx) => {
    const h = idx + 1;
    // Random-walk-style growing uncertainty band: width scales with sqrt(h).
    // 1.2816 ~= z-value for an 80% interval (p10/p90). APPROXIMATION, not
    // from any file in this repo.
    const bandWidth = 1.2816 * residualStd * Math.sqrt(h);
    const date = addDays(startOfDayUTC(last.recordedAt), h);
    return {
      date: date.toISOString().slice(0, 10),
      p10: Math.max(0, p50 - bandWidth),
      p50: Math.max(0, p50),
      p90: Math.max(0, p50 + bandWidth),
    };
  });

  const forecast: Forecast = {
    metricKey: def.key,
    method: selection.method,
    generatedAt: new Date().toISOString(),
    horizonDays: FORECAST_HORIZON_DAYS,
    points,
    accuracy,
    mape,
    parameters,
  };

  setCachedForecast(def.key, fingerprint, forecast);
  return forecast;
}

// --------------------------------------------------------------------------
// C. Anomaly detection (z-score + CUSUM, deduplicated)
// --------------------------------------------------------------------------

export function detectAnomaliesForMetric(def: MetricDef, values: MetricValue[]): Anomaly[] {
  const sorted = sortedValues(values);
  if (sorted.length < 5) return [];

  const rawSeries = sorted.map((v) => v.value);

  // Method 1 — z-score vs 90-point (≈90-day) rolling mean/stdDev.
  const pointAnomalies = computeZScoreAnomalies(rawSeries, 90, 2.5);

  // Method 2 — tabular CUSUM structural breaks (Page, 1954).
  const cusumResults = computeCUSUM(rawSeries, 0.5, 4, 90);
  const breaches = cusumResults.filter((r) => r.breach);
  const breachIndices = new Set(breaches.map((b) => b.index));

  // Dedup: drop point anomalies within 2 data points of a structural break —
  // the structural break is more informative.
  const dedupedPointAnomalies = pointAnomalies.filter(
    (pa) => ![...breachIndices].some((bi) => Math.abs(bi - pa.index) <= 2),
  );

  const anomalies: Anomaly[] = [];

  for (const pa of dedupedPointAnomalies) {
    anomalies.push({
      metricKey: def.key,
      type: "point",
      detectedAt: sorted[pa.index].recordedAt.toISOString(),
      value: pa.value,
      expected: pa.expected,
      zScore: pa.z,
      cusum: null,
      description: `Value ${pa.value.toFixed(2)} deviates from the 90-point rolling mean ${pa.expected.toFixed(2)} (z=${pa.z.toFixed(2)}).`,
    });
  }

  for (const b of breaches) {
    const direction = b.sHigh > b.sLow ? "upward" : "downward";
    anomalies.push({
      metricKey: def.key,
      type: "structural_break",
      detectedAt: sorted[b.index].recordedAt.toISOString(),
      value: b.value,
      expected: rawSeries[b.index - 1] ?? b.value,
      zScore: null,
      cusum: { sHigh: b.sHigh, sLow: b.sLow, threshold: b.threshold },
      description: `Tabular CUSUM detected a ${direction} structural break (S_high=${b.sHigh.toFixed(2)}, S_low=${b.sLow.toFixed(2)}, h=${b.threshold.toFixed(2)}).`,
    });
  }

  return anomalies.sort((a, b) => a.detectedAt.localeCompare(b.detectedAt));
}

// --------------------------------------------------------------------------
// Daily-grid alignment helper (data prep, not a core algorithm) — needed so
// Pearson correlation / cross-correlation compares metrics on a shared time
// axis even when recording cadences differ. LOCF = last observation carried
// forward; days before a metric's first reading are back-filled with that
// first reading so every metric shares the same array length.
// --------------------------------------------------------------------------

function alignToDailyGrid(values: MetricValue[], from: Date, to: Date): number[] {
  const sorted = sortedValues(values);
  if (sorted.length === 0) return [];

  const start = startOfDayUTC(from);
  const end = startOfDayUTC(to);
  const totalDays = Math.max(0, Math.round(daysBetween(start, end)));

  const series: number[] = [];
  let pointer = 0;
  let current = sorted[0].value;

  for (let d = 0; d <= totalDays; d++) {
    const day = addDays(start, d);
    while (
      pointer < sorted.length &&
      startOfDayUTC(sorted[pointer].recordedAt).getTime() <= day.getTime()
    ) {
      current = sorted[pointer].value;
      pointer++;
    }
    series.push(current);
  }

  return series;
}

// --------------------------------------------------------------------------
// D. Correlation matrix
// --------------------------------------------------------------------------

export function buildCorrelationMatrix(
  defs: MetricDef[],
  valuesByMetric: Record<string, MetricValue[]>,
  now: Date,
): { matrix: CorrelationMatrix; dailySeries: Record<string, number[]> } {
  const eligible = defs.filter((d) => (valuesByMetric[d.key]?.length ?? 0) >= 10);

  if (eligible.length < 2) {
    return {
      matrix: {
        pairs: [],
        significantPairs: [],
        interpretation: "Not enough metrics with sufficient history to compute correlations.",
      },
      dailySeries: {},
    };
  }

  const allDates = eligible.flatMap((d) => valuesByMetric[d.key].map((v) => v.recordedAt));
  const from = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const to = now;

  const dailySeries: Record<string, number[]> = {};
  for (const def of eligible) {
    dailySeries[def.key] = alignToDailyGrid(valuesByMetric[def.key], from, to);
  }

  const rawPairs = buildCorrelationPairs(dailySeries);
  const pairs: CorrelationPair[] = rawPairs.map((p) => ({
    metricA: p.metricA,
    metricB: p.metricB,
    r: p.r,
    n: p.n,
  }));

  const significantPairs = pairs.filter((p) => Math.abs(p.r) > 0.6);

  let interpretation: string;
  if (pairs.length === 0) {
    interpretation = "Not enough overlapping data to compute correlations.";
  } else {
    const strongestPositive = pairs.reduce((a, b) => (b.r > a.r ? b : a));
    const strongestNegative = pairs.reduce((a, b) => (b.r < a.r ? b : a));
    const positiveText =
      strongestPositive.r > 0
        ? `The strongest positive correlation is ${strongestPositive.metricA} vs ${strongestPositive.metricB} (r=${strongestPositive.r.toFixed(2)}).`
        : "No positive correlations were found.";
    const negativeText =
      strongestNegative.r < 0
        ? `The strongest negative correlation is ${strongestNegative.metricA} vs ${strongestNegative.metricB} (r=${strongestNegative.r.toFixed(2)}).`
        : "No negative correlations were found.";
    interpretation = `${positiveText} ${negativeText}`;
  }

  return { matrix: { pairs, significantPairs, interpretation }, dailySeries };
}

// --------------------------------------------------------------------------
// E. Causal hypotheses (cross-correlation ≠ causation — see interpretation)
// --------------------------------------------------------------------------

const LAG_CANDIDATES_DAYS = [7, 14, 21, 30, 60];

function confidenceFromR(r: number): CausalConfidence {
  const abs = Math.abs(r);
  if (abs > 0.8) return "strong";
  if (abs > 0.65) return "moderate";
  return "tentative";
}

export function buildCausalHypotheses(
  significantPairs: CorrelationPair[],
  dailySeries: Record<string, number[]>,
): MetricCausalHypothesis[] {
  const hypotheses: MetricCausalHypothesis[] = [];

  for (const pair of significantPairs) {
    const a = dailySeries[pair.metricA];
    const b = dailySeries[pair.metricB];
    if (!a || !b) continue;

    let best = { lead: pair.metricA, lag: pair.metricB, lagDays: 0, r: pair.r };

    for (const lagDays of LAG_CANDIDATES_DAYS) {
      const rAleadsB = crossCorrelationAtLag(a, b, lagDays);
      if (Math.abs(rAleadsB) > Math.abs(best.r)) {
        best = { lead: pair.metricA, lag: pair.metricB, lagDays, r: rAleadsB };
      }
      const rBleadsA = crossCorrelationAtLag(b, a, lagDays);
      if (Math.abs(rBleadsA) > Math.abs(best.r)) {
        best = { lead: pair.metricB, lag: pair.metricA, lagDays, r: rBleadsA };
      }
    }

    if (best.lagDays === 0 || Math.abs(best.r) <= 0.6) continue;

    const confidence = confidenceFromR(best.r);
    hypotheses.push({
      leadMetric: best.lead,
      lagMetric: best.lag,
      lagDays: best.lagDays,
      correlationAtLag: best.r,
      confidence,
      interpretation: `When ${best.lead} changes, ${best.lag} tends to follow ${best.lagDays} days later (cross-correlation r=${best.r.toFixed(2)} at that lag). This is a ${confidence} statistical association, not proven causation.`,
    });
  }

  return hypotheses;
}

// --------------------------------------------------------------------------
// F. Composite domain scores
// --------------------------------------------------------------------------

export function computeCompositeScores(
  defs: MetricDef[],
  healthMap: Record<string, MetricHealthFull>,
  now: Date,
): Record<string, DomainMetricScore> {
  const result: Record<string, DomainMetricScore> = {};

  for (const domain of DOMAINS) {
    const domainDefs = defs.filter((d) => d.domain === domain && healthMap[d.key]);
    if (domainDefs.length === 0) {
      result[domain] = {
        domain,
        score: 0,
        metricsAboveTarget: 0,
        metricsBelowTarget: 0,
        trend: "stable",
        drivers: [],
      };
      continue;
    }

    let weightedScoreSum = 0;
    let weightTotal = 0;
    let metricsAboveTarget = 0;
    let metricsBelowTarget = 0;
    let trendSignalSum = 0;
    const driverCandidates: { label: string; magnitude: number }[] = [];

    const trendNumeric: Record<TrendDirection, number> = {
      strong_up: 2,
      up: 1,
      flat: 0,
      down: -1,
      strong_down: -2,
    };

    for (const def of domainDefs) {
      const health = healthMap[def.key];
      let ratio = 1; // neutral (no target defined)
      if (def.target !== null && def.target !== 0) {
        ratio = def.higherIsBetter
          ? health.currentValue / def.target
          : def.target / health.currentValue;
        if (!Number.isFinite(ratio)) ratio = health.currentValue > 0 ? 2 : 0;

        const meetsTarget = def.higherIsBetter
          ? health.currentValue >= def.target
          : health.currentValue <= def.target;
        if (meetsTarget) metricsAboveTarget++;
        else metricsBelowTarget++;
      }

      const clamped = clamp(ratio, 0, 2);
      const scoreI = clamped * 50;

      const ageDays = daysBetween(now, new Date(health.lastUpdated));
      const weight = recencyWeight(ageDays, 14) * (def.weight || 1);

      weightedScoreSum += weight * scoreI;
      weightTotal += weight;

      const directionMultiplier = def.higherIsBetter ? 1 : -1;
      trendSignalSum += weight * directionMultiplier * trendNumeric[health.trend];

      driverCandidates.push({
        label: `${def.name} (${scoreI >= 50 ? "+" : ""}${(scoreI - 50).toFixed(0)})`,
        magnitude: Math.abs(weight * (scoreI - 50)),
      });
    }

    const score = weightTotal > 0 ? weightedScoreSum / weightTotal : 0;
    const normalizedTrendSignal = weightTotal > 0 ? trendSignalSum / weightTotal : 0;

    let trend: DomainMetricScore["trend"] = "stable";
    if (normalizedTrendSignal > 0.4) trend = "improving";
    else if (normalizedTrendSignal < -0.4) trend = "degrading";

    const drivers = driverCandidates
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, 3)
      .map((d) => d.label);

    result[domain] = {
      domain,
      score,
      metricsAboveTarget,
      metricsBelowTarget,
      trend,
      drivers,
    };
  }

  return result;
}

// --------------------------------------------------------------------------
// G. Alert queue
// --------------------------------------------------------------------------

export function buildAlertQueue(
  defs: MetricDef[],
  valuesByMetric: Record<string, MetricValue[]>,
  healthMap: Record<string, MetricHealthFull>,
  forecasts: Record<string, Forecast>,
  anomalies: Anomaly[],
): MetricAlert[] {
  const alerts: MetricAlert[] = [];
  const defByKey = new Map(defs.map((d) => [d.key, d]));

  // Rule: structural break -> severity 4. z>3.5 -> severity 4, z>2.5 -> severity 3.
  for (const a of anomalies) {
    if (a.type === "structural_break") {
      alerts.push({
        metricKey: a.metricKey,
        type: "structural_break",
        severity: 4,
        message: a.description,
        value: a.value,
        threshold: a.cusum?.threshold ?? null,
        detectedAt: new Date(a.detectedAt),
      });
    } else if (a.zScore !== null) {
      const severity = Math.abs(a.zScore) > 3.5 ? 4 : 3;
      alerts.push({
        metricKey: a.metricKey,
        type: "anomaly",
        severity,
        message: a.description,
        value: a.value,
        threshold: 2.5,
        detectedAt: new Date(a.detectedAt),
      });
    }
  }

  // Rule: two consecutive anomalies on the same metric -> severity 5.
  const anomaliesByMetric = new Map<string, Anomaly[]>();
  for (const a of anomalies) {
    if (!anomaliesByMetric.has(a.metricKey)) anomaliesByMetric.set(a.metricKey, []);
    anomaliesByMetric.get(a.metricKey)!.push(a);
  }
  for (const [metricKey, list] of anomaliesByMetric) {
    if (list.length < 2) continue;
    const sortedList = [...list].sort((a, b) => a.detectedAt.localeCompare(b.detectedAt));
    const latestTwo = sortedList.slice(-2);
    const gapDays = daysBetween(new Date(latestTwo[0].detectedAt), new Date(latestTwo[1].detectedAt));
    if (gapDays <= 14) {
      alerts.push({
        metricKey,
        type: "anomaly",
        severity: 5,
        message: `Two anomalies detected within ${gapDays.toFixed(0)} days — this metric is behaving unpredictably.`,
        value: latestTwo[1].value,
        threshold: null,
        detectedAt: new Date(latestTwo[1].detectedAt),
      });
    }
  }

  // Rule: vsTarget < -20% (worse than target by 20%+) -> severity 4.
  for (const [key, health] of Object.entries(healthMap)) {
    const def = defByKey.get(key);
    if (!def || def.target === null || health.vsTargetPct === null) continue;
    const directionalDiff = def.higherIsBetter ? health.vsTargetPct : -health.vsTargetPct;
    if (directionalDiff <= -20) {
      alerts.push({
        metricKey: key,
        type: "target_miss",
        severity: 4,
        message: `${def.name} is ${Math.abs(health.vsTargetPct).toFixed(1)}% ${health.vsTargetPct < 0 ? "below" : "above"} target (${def.target}).`,
        value: health.currentValue,
        threshold: def.target,
        detectedAt: new Date(health.lastUpdated),
      });
    } else if (directionalDiff <= -10) {
      alerts.push({
        metricKey: key,
        type: "target_miss",
        severity: 2,
        message: `${def.name} is trailing target by ${Math.abs(health.vsTargetPct).toFixed(1)}%.`,
        value: health.currentValue,
        threshold: def.target,
        detectedAt: new Date(health.lastUpdated),
      });
    }
  }

  // Rule: forecast p10 (pessimistic band) crosses target within <90 days -> severity 3.
  for (const [key, forecast] of Object.entries(forecasts)) {
    const def = defByKey.get(key);
    if (!def || def.target === null) continue;
    const first90 = forecast.points.slice(0, 90);
    const pessimisticSeries = def.higherIsBetter
      ? first90.map((p) => p.p10)
      : first90.map((p) => p.p90);

    const crossingIdx = pessimisticSeries.findIndex((v) =>
      def.higherIsBetter ? v < (def.target as number) : v > (def.target as number),
    );

    if (crossingIdx >= 0) {
      const daysAhead = crossingIdx + 1;
      alerts.push({
        metricKey: key,
        type: "forecast_threshold",
        severity: 3,
        message: `Forecast suggests ${def.name} may cross target (${def.target}) in ${daysAhead} days (pessimistic case).`,
        value: pessimisticSeries[crossingIdx],
        threshold: def.target,
        detectedAt: new Date(forecast.points[crossingIdx].date),
      });
    }
  }

  // Rule: trend reversal — OLS slope sign flips between the previous and
  // most recent ~20-point windows.
  for (const def of defs) {
    const values = sortedValues(valuesByMetric[def.key] ?? []);
    if (values.length < 40) continue;
    const prevWindow = values.slice(-40, -20).map((v) => v.value);
    const recentWindow = values.slice(-20).map((v) => v.value);
    const prevSlope = olsRegression(prevWindow).slope;
    const recentSlope = olsRegression(recentWindow).slope;
    const sigma = stdDev(recentWindow) || 1e-9;
    const flipped = Math.sign(prevSlope) !== 0 && Math.sign(prevSlope) !== Math.sign(recentSlope);
    const meaningful = Math.abs(recentSlope) > 0.05 * sigma;
    if (flipped && meaningful) {
      const last = values[values.length - 1];
      alerts.push({
        metricKey: def.key,
        type: "trend_reversal",
        severity: 3,
        message: `${def.name}'s trend reversed from ${prevSlope > 0 ? "upward" : "downward"} to ${recentSlope > 0 ? "upward" : "downward"}.`,
        value: last.value,
        threshold: null,
        detectedAt: last.recordedAt,
      });
    }
  }

  return alerts.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return b.detectedAt.getTime() - a.detectedAt.getTime();
  });
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------

export function runMetricsIntelligence(
  metricDefs: MetricDef[],
  metricValues: MetricValue[],
  _events: LeadosEvent[],
  now: Date,
): MetricsIntelligenceReport {
  const valuesByMetric = groupValuesByMetric(metricValues);

  const metricHealthMap: Record<string, MetricHealthFull> = {};
  for (const def of metricDefs) {
    const health = computeMetricHealth(def, valuesByMetric[def.key] ?? [], now);
    if (health) metricHealthMap[def.key] = health;
  }

  const forecasts: Record<string, Forecast> = {};
  for (const def of metricDefs) {
    const forecast = computeForecastForMetric(def, valuesByMetric[def.key] ?? []);
    if (forecast) forecasts[def.key] = forecast;
  }

  const anomalies: Anomaly[] = [];
  for (const def of metricDefs) {
    anomalies.push(...detectAnomaliesForMetric(def, valuesByMetric[def.key] ?? []));
  }

  const { matrix: correlationMatrix, dailySeries } = buildCorrelationMatrix(
    metricDefs,
    valuesByMetric,
    now,
  );

  const causalHypotheses = buildCausalHypotheses(correlationMatrix.significantPairs, dailySeries);

  const compositeScores = computeCompositeScores(metricDefs, metricHealthMap, now);

  const alertQueue = buildAlertQueue(
    metricDefs,
    valuesByMetric,
    metricHealthMap,
    forecasts,
    anomalies,
  );

  return {
    metricHealthMap,
    forecasts,
    anomalies,
    correlationMatrix,
    causalHypotheses,
    compositeScores,
    alertQueue,
    generatedAt: now.toISOString(),
  };
}
