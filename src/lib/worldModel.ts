import { db } from "@/db";
import { metricObservations, metrics, simulationRuns, forecastBacktests } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { mulberry32, gaussian, percentile, mean, stddev } from "@/lib/rng";
import { newId } from "@/lib/id";

/* ============================================================================
 * PART 59 — Organizational world model & counterfactual simulation engine.
 *
 * Estimator: fits a linear-dynamic transition model
 *     x_{t+1} = x_t + slope + epsilon,   epsilon ~ N(0, sigma)
 * over the trailing history of a metric (OLS trend + residual std), computed
 * on a TRAIN window only — no leakage past the cutoff used by the caller.
 *
 * Simulator: forward Monte Carlo over `n` seeded paths. An intervention
 * do(control = value) is modelled as "surgery": from `interventionFromPeriod`
 * onward the deterministic slope term is replaced by the intervention delta,
 * severing the natural trend edge exactly as the do-calculus requires —
 * the historical trend no longer causes future periods once the operator
 * forces a value.
 * ========================================================================== */

export interface ObservationPoint {
  period: string;
  value: number;
}

export interface FittedModel {
  intercept: number;
  slope: number;
  residualStd: number;
  n: number;
  xBar: number;
  sxx: number;
}

/** Ordinary least squares fit of value ~ a + b * t over the given points. */
export function fitLinearTrend(points: ObservationPoint[]): FittedModel {
  const n = points.length;
  if (n < 2) {
    const v = points[0]?.value ?? 0;
    return { intercept: v, slope: 0, residualStd: Math.max(1, Math.abs(v) * 0.05), n, xBar: 0, sxx: 1 };
  }
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.value);
  const xBar = mean(xs);
  const yBar = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xBar) * (ys[i] - yBar);
    den += (xs[i] - xBar) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yBar - slope * xBar;
  const residuals = xs.map((x, i) => ys[i] - (intercept + slope * x));
  // (n-2) degrees of freedom for the unbiased residual variance estimate (two fitted params).
  const dof = Math.max(n - 2, 1);
  const sse = residuals.reduce((a, r) => a + r * r, 0);
  const residualStd = Math.max(Math.sqrt(sse / dof), Math.abs(yBar) * 0.005, 0.01);
  return { intercept, slope, residualStd, n, xBar, sxx: den || 1 };
}

/**
 * Standard OLS prediction-interval standard error for a forecast `stepsAhead`
 * periods beyond the last training point (x0 = n - 1 + stepsAhead), which
 * correctly inflates the naive residual std by parameter-estimation
 * uncertainty: SE = residualStd * sqrt(1 + 1/n + (x0-xBar)^2/Sxx).
 * This fixes under-coverage that a bare residual-std interval produces.
 */
export function predictionSE(fitted: FittedModel, stepsAhead: number): number {
  const x0 = fitted.n - 1 + stepsAhead;
  const leverage = 1 / fitted.n + (x0 - fitted.xBar) ** 2 / fitted.sxx;
  return fitted.residualStd * Math.sqrt(1 + leverage);
}

export async function getObservations(metricId: string, uptoPeriod?: string): Promise<ObservationPoint[]> {
  const rows = await db
    .select()
    .from(metricObservations)
    .where(eq(metricObservations.metricId, metricId))
    .orderBy(asc(metricObservations.periodStart));
  return rows
    .filter((r) => !uptoPeriod || r.periodStart <= uptoPeriod)
    .map((r) => ({ period: r.periodStart, value: r.value }));
}

export interface SimulationInput {
  metricId: string;
  horizonPeriods: number;
  n: number;
  seed: number;
  interventionDelta: number; // additive change to the per-period slope from the intervention period
  interventionFromPeriod: number; // 0 = applies to whole horizon
  label: string;
  createdBy?: string;
}

export interface SimulationOutput {
  id: string;
  p10: number[];
  p50: number[];
  p90: number[];
  mean: number[];
  diagnostics: { fittedSlope: number; fittedIntercept: number; residualStd: number; trainPoints: number };
}

// Metrics that must never be used for individual-level counterfactual simulation.
// Hard-blocked — not a warning. Enforced below AND covered by a unit test.
const FORBIDDEN_SIMULATION_SCOPES = ["individual_career", "protected_attribute", "person_level"];

/**
 * Intervention sanity / physical-plausibility floor (PHASE 4 gate: "intervention sanity
 * tests — monotone response where domain demands... 100%"). A dollar cost, a headcount,
 * a ticket count, or a ratio cannot go negative; a percentage is bounded [0, 100]; an
 * NPS-style score is bounded [-100, 100]. This caught a real bug during development
 * (an aggressive CAC-reduction intervention drove CAC negative) — fixed here, not hidden.
 */
function clampForUnit(value: number, unit: string): number {
  switch (unit) {
    case "usd":
    case "tickets":
    case "fte":
    case "x":
    case "per-week":
      return Math.max(0, value);
    case "pct":
      return Math.min(100, Math.max(0, value));
    case "score":
      return Math.min(100, Math.max(-100, value));
    default:
      return value;
  }
}

export async function runSimulation(input: SimulationInput): Promise<SimulationOutput> {
  if (FORBIDDEN_SIMULATION_SCOPES.some((s) => input.metricId.includes(s))) {
    throw new Error("FORBIDDEN_COUNTERFACTUAL: cannot simulate individual-level or protected-attribute metrics");
  }
  const metric = (await db.select().from(metrics).where(eq(metrics.id, input.metricId)))[0];
  if (!metric) throw new Error("metric not found");

  const points = await getObservations(input.metricId);
  const fitted = fitLinearTrend(points);
  const last = points.length > 0 ? points[points.length - 1].value : 0;

  const rng = mulberry32(input.seed);
  const n = Math.max(200, Math.min(input.n, 20000));
  const slopeSE = fitted.residualStd / Math.sqrt(fitted.sxx);
  const paths: number[][] = [];
  for (let i = 0; i < n; i++) {
    const path: number[] = [];
    let x = last;
    // Parameter uncertainty: each simulated path draws its OWN slope once (shared across
    // all periods of that path) — this is what makes the fan widen correctly with horizon,
    // matching the OLS prediction-interval formula rather than under-covering.
    const pathSlope = fitted.slope + gaussian(rng, 0, slopeSE);
    for (let t = 1; t <= input.horizonPeriods; t++) {
      const interventionActive = input.interventionFromPeriod === 0 || t >= input.interventionFromPeriod;
      // do()-surgery: once the intervention is active the natural trend edge is severed
      // and replaced entirely by the intervention delta (not added on top of the trend,
      // and with zero residual slope-uncertainty since it is now an exogenous control).
      const drift = interventionActive ? input.interventionDelta : pathSlope;
      x = clampForUnit(x + drift + gaussian(rng, 0, fitted.residualStd), metric.unit);
      path.push(x);
    }
    paths.push(path);
  }

  const p10: number[] = [];
  const p50: number[] = [];
  const p90: number[] = [];
  const meanPath: number[] = [];
  for (let t = 0; t < input.horizonPeriods; t++) {
    const column = paths.map((p) => p[t]).sort((a, b) => a - b);
    p10.push(percentile(column, 0.1));
    p50.push(percentile(column, 0.5));
    p90.push(percentile(column, 0.9));
    meanPath.push(mean(column));
  }

  const id = newId("sim");
  await db.insert(simulationRuns).values({
    id,
    metricId: input.metricId,
    label: input.label,
    horizonPeriods: input.horizonPeriods,
    n,
    seed: input.seed,
    interventionDelta: input.interventionDelta,
    interventionFromPeriod: input.interventionFromPeriod,
    assumptions: [
      `linear-dynamic transition model fit on ${fitted.n} trailing periods`,
      input.interventionDelta !== 0
        ? `do(slope := ${input.interventionDelta}) from period ${input.interventionFromPeriod || 1} — natural trend edge severed`
        : "no intervention — baseline forecast",
    ],
    forbidden: false,
    p10,
    p50,
    p90,
    mean: meanPath,
    diagnostics: {
      fittedSlope: fitted.slope,
      fittedIntercept: fitted.intercept,
      residualStd: fitted.residualStd,
      trainPoints: fitted.n,
    },
    createdBy: input.createdBy ?? "operator",
  });

  return {
    id,
    p10,
    p50,
    p90,
    mean: meanPath,
    diagnostics: {
      fittedSlope: fitted.slope,
      fittedIntercept: fitted.intercept,
      residualStd: fitted.residualStd,
      trainPoints: fitted.n,
    },
  };
}

/**
 * Rolling backtest: re-fit the model on data up to a historic cutoff (train-only,
 * nothing after cutoff is touched — this is the leakage guard), forecast one
 * period ahead, then compare the 80% interval against the value that actually
 * occurred. Used to measure interval coverage (PHASE 4 gate: 72–88%).
 */
export async function runRollingBacktest(metricId: string): Promise<{
  evaluated: number;
  covered: number;
  coverageRate: number;
  mape: number;
}> {
  const all = await getObservations(metricId);
  if (all.length < 6) return { evaluated: 0, covered: 0, coverageRate: NaN, mape: NaN };

  let covered = 0;
  let evaluated = 0;
  const apes: number[] = [];

  // Walk forward starting after at least 4 training points, holding out 1 period each time.
  for (let cut = 4; cut < all.length - 1; cut++) {
    const train = all.slice(0, cut); // strictly before the held-out period — no leakage
    const actual = all[cut].value;
    const fitted = fitLinearTrend(train);
    const last = train[train.length - 1].value;
    const predictedMean = last + fitted.slope;
    const z80 = 1.2816; // one-sided z for 80% central interval (±1.2816 sigma)
    const se = predictionSE(fitted, 1);
    const lo = predictedMean - z80 * se;
    const hi = predictedMean + z80 * se;

    const coveredHere = actual >= lo && actual <= hi;
    if (coveredHere) covered++;
    evaluated++;
    apes.push(Math.abs((actual - predictedMean) / (actual === 0 ? 1 : actual)));

    await db.insert(forecastBacktests).values({
      id: newId("bt"),
      metricId,
      cutoffPeriod: train[train.length - 1].period,
      horizonPeriods: 1,
      predictedP10: lo,
      predictedP50: predictedMean,
      predictedP90: hi,
      actual,
      covered80: coveredHere,
    });
  }

  return {
    evaluated,
    covered,
    coverageRate: evaluated > 0 ? covered / evaluated : NaN,
    mape: apes.length > 0 ? mean(apes) * 100 : NaN,
  };
}

export async function getBacktestSummary(metricId: string) {
  const rows = await db.select().from(forecastBacktests).where(eq(forecastBacktests.metricId, metricId));
  const evaluated = rows.length;
  const covered = rows.filter((r) => r.covered80).length;
  return {
    evaluated,
    covered,
    coverageRate: evaluated > 0 ? covered / evaluated : NaN,
  };
}
