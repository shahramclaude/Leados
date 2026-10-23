// Part 59 — World Model & Scenario Simulation Engine: DB-backed wrapper.
// The actual math (OLS fit, Monte Carlo simulation, in-memory backtest) is
// in `src/lib/worldModelCore.ts`, which has no DB/Next.js imports so the
// eval harness and unit tests never need a live database. This file adds
// persistence: reading observations, running + storing a simulation,
// running + storing a backtest, and the calibration report query.
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { forecastBacktests, metricObservations, metrics, simulationRuns } from "@/db/schema";
import { fitLinearTrend, simulateMonteCarlo, type ObservationPoint } from "@/lib/worldModelCore";

export type { ObservationPoint, FittedModel, InterventionSpec, SimulationBandPoint, SimulationResult, InMemoryBacktestPoint } from "@/lib/worldModelCore";
export { fitLinearTrend, predictionSE, simulateMonteCarlo, backtestSeriesInMemory } from "@/lib/worldModelCore";

export async function getObservations(metricId: string, uptoPeriod?: string): Promise<ObservationPoint[]> {
  const rows = await db
    .select()
    .from(metricObservations)
    .where(
      uptoPeriod
        ? and(eq(metricObservations.metricId, metricId), lte(metricObservations.period, uptoPeriod))
        : eq(metricObservations.metricId, metricId),
    )
    .orderBy(asc(metricObservations.period), asc(metricObservations.createdAt));

  // Latest-created row wins per period (append-only correction semantics).
  const byPeriod = new Map<string, number>();
  for (const row of rows) {
    byPeriod.set(row.period, Number(row.value));
  }
  return [...byPeriod.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([period, value]) => ({ period, value }));
}

export interface RunSimulationInput {
  metricId: string;
  label?: string;
  horizon: number;
  trials: number;
  seed: number;
  interventionFromStep?: number;
  interventionDelta?: number;
}

export async function runAndPersistSimulation(input: RunSimulationInput) {
  const points = await getObservations(input.metricId);
  if (points.length === 0) {
    throw new Error("metric has no observations; cannot fit a world model");
  }
  const fitted = fitLinearTrend(points);
  const lastValue = points[points.length - 1].value;
  const intervention =
    input.interventionFromStep != null && input.interventionDelta != null
      ? { fromStep: input.interventionFromStep, delta: input.interventionDelta }
      : undefined;

  const result = simulateMonteCarlo(fitted, lastValue, input.horizon, input.trials, input.seed, intervention);

  const [row] = await db
    .insert(simulationRuns)
    .values({
      metricId: input.metricId,
      label: input.label ?? "",
      trials: input.trials,
      horizon: input.horizon,
      seed: input.seed,
      interventionFromStep: input.interventionFromStep ?? null,
      interventionDelta: input.interventionDelta != null ? String(input.interventionDelta) : null,
      fittedSlope: String(fitted.slope),
      fittedIntercept: String(fitted.intercept),
      fittedResidualStd: String(fitted.residualStd),
      bands: result.bands,
    })
    .returning();

  return { run: row, bands: result.bands, fitted };
}

export interface BacktestInput {
  metricId: string;
  cutoffPeriod: string;
  horizon: number;
  trials?: number;
  seed?: number;
}

/**
 * Fit strictly on observations up to and including `cutoffPeriod`, simulate
 * `horizon` steps ahead, and compare the P10/P90 band at that horizon to
 * whatever actually happened `horizon` periods later (if we have that
 * observation). Returns null (and persists nothing) if there is no actual
 * value to compare against yet — a backtest with no ground truth is not a
 * backtest.
 */
export async function runBacktest(input: BacktestInput) {
  const trainPoints = await getObservations(input.metricId, input.cutoffPeriod);
  if (trainPoints.length < 3) {
    throw new Error("need at least 3 training observations before the cutoff to backtest");
  }
  const allPoints = await getObservations(input.metricId);
  const cutoffIdx = allPoints.findIndex((p) => p.period === input.cutoffPeriod);
  if (cutoffIdx === -1) {
    throw new Error("cutoffPeriod must be an existing observation period");
  }
  const targetIdx = cutoffIdx + input.horizon;
  if (targetIdx >= allPoints.length) {
    return null; // no ground truth yet
  }
  const targetPoint = allPoints[targetIdx];

  const fitted = fitLinearTrend(trainPoints);
  const lastValue = trainPoints[trainPoints.length - 1].value;
  const trials = input.trials ?? 2000;
  const seed = input.seed ?? 1234567;
  const result = simulateMonteCarlo(fitted, lastValue, input.horizon, trials, seed);
  const band = result.bands[result.bands.length - 1];
  const withinInterval = targetPoint.value >= band.p10 && targetPoint.value <= band.p90;

  const [row] = await db
    .insert(forecastBacktests)
    .values({
      metricId: input.metricId,
      cutoffPeriod: input.cutoffPeriod,
      horizon: input.horizon,
      targetPeriod: targetPoint.period,
      p10: String(band.p10),
      p50: String(band.p50),
      p90: String(band.p90),
      actual: String(targetPoint.value),
      withinInterval,
    })
    .returning();

  return row;
}

export interface CalibrationReport {
  totalBacktests: number;
  withinIntervalCount: number;
  coverageRate: number | null; // null when totalBacktests === 0
  acceptLow: number;
  acceptHigh: number;
  pass: boolean | "unknown";
  perMetric: { metricId: string; metricKey: string; total: number; within: number; coverageRate: number }[];
}

/**
 * The calibration gate: for an 80% central interval (P10–P90), the empirical
 * coverage rate across all backtests should fall in [72%, 88%] (a standard
 * tolerance band around the nominal 80%, consistent with the cash-forecast
 * gate pattern used elsewhere in the program). This is measured, never
 * assumed — see `scripts/evalWorldModel.ts` for the synthetic-data version
 * of the same gate, which does not require a database.
 */
export async function getCalibrationReport(): Promise<CalibrationReport> {
  const rows = await db
    .select({
      metricId: forecastBacktests.metricId,
      withinInterval: forecastBacktests.withinInterval,
      metricKey: metrics.key,
    })
    .from(forecastBacktests)
    .innerJoin(metrics, eq(forecastBacktests.metricId, metrics.id));

  const total = rows.length;
  const within = rows.filter((r) => r.withinInterval).length;
  const acceptLow = 0.72;
  const acceptHigh = 0.88;

  const perMetricMap = new Map<string, { metricKey: string; total: number; within: number }>();
  for (const r of rows) {
    const entry = perMetricMap.get(r.metricId) ?? { metricKey: r.metricKey, total: 0, within: 0 };
    entry.total += 1;
    if (r.withinInterval) entry.within += 1;
    perMetricMap.set(r.metricId, entry);
  }

  return {
    totalBacktests: total,
    withinIntervalCount: within,
    coverageRate: total === 0 ? null : within / total,
    acceptLow,
    acceptHigh,
    pass: total === 0 ? "unknown" : within / total >= acceptLow && within / total <= acceptHigh,
    perMetric: [...perMetricMap.entries()].map(([metricId, v]) => ({
      metricId,
      metricKey: v.metricKey,
      total: v.total,
      within: v.within,
      coverageRate: v.within / v.total,
    })),
  };
}
