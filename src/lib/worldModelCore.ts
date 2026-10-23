// Part 59 — World Model & Scenario Simulation Engine: PURE core.
//
// This module has zero DB / Next.js imports on purpose: the calibration
// eval harness (`scripts/evalWorldModel.ts`) and the unit tests import only
// from here, so "run the gate" never requires a live Postgres connection.
// `src/lib/worldModel.ts` wraps these functions with persistence.
//
// Estimator: fits a linear-dynamic transition model
//     x_{t+1} = x_t + slope + epsilon,   epsilon ~ N(0, residualStd)
// via Ordinary Least Squares of value ~ a + b*t over a trailing window of
// observations (the "world model" of one metric). Fit on a TRAIN window
// only — callers that backtest must pass only observations up to and
// including the cutoff period, never anything after it (no leakage).
//
// Simulator: forward Monte Carlo over `trials` seeded sample paths, `horizon`
// steps ahead. An intervention do(effect = delta) is modelled as "surgery":
// from `interventionFromStep` onward, the deterministic slope term is
// replaced by `interventionDelta` per step — severing the natural trend edge
// exactly as Pearl's do-calculus requires (the historical trend no longer
// causes future periods once an operator forces a value), rather than just
// adding the intervention on top of the organic trend.
//
// All randomness flows through a single seeded mulberry32 stream per run, so
// two runs with the same (points, horizon, trials, seed, intervention)
// produce byte-identical output. This is what makes simulations auditable
// and property-testable instead of "AI vibes".
import { gaussian, mean, mulberry32, percentile } from "@/lib/rng";

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

/** Ordinary least squares fit of value ~ a + b * t over the given points (t = index). */
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
  // (n - 2) degrees of freedom: two fitted parameters (intercept, slope).
  const dof = Math.max(n - 2, 1);
  const sse = residuals.reduce((a, r) => a + r * r, 0);
  const residualStd = Math.max(Math.sqrt(sse / dof), Math.abs(yBar) * 0.005, 1e-6);
  return { intercept, slope, residualStd, n, xBar, sxx: den || 1 };
}

/**
 * OLS prediction-interval standard error `stepsAhead` periods beyond the
 * last training point (x0 = n - 1 + stepsAhead). Inflates the bare residual
 * std by parameter-estimation uncertainty:
 *     SE = residualStd * sqrt(1 + 1/n + (x0 - xBar)^2 / Sxx)
 * A bare residual-std interval under-covers; this leverage term is what
 * fixes that (and is why the calibration backtest matters — see
 * `getCalibrationReport` / `eval:worldmodel`).
 */
export function predictionSE(fitted: FittedModel, stepsAhead: number): number {
  const x0 = fitted.n - 1 + stepsAhead;
  const leverage = 1 / fitted.n + (x0 - fitted.xBar) ** 2 / fitted.sxx;
  return fitted.residualStd * Math.sqrt(1 + leverage);
}

export interface InterventionSpec {
  /** 1-indexed simulation step from which the intervention takes effect. */
  fromStep: number;
  /** Replaces the per-step organic slope with this delta from fromStep onward. */
  delta: number;
}

export interface SimulationBandPoint {
  step: number;
  mean: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface SimulationResult {
  bands: SimulationBandPoint[];
  /** Full path matrix only returned when `returnPaths` is requested (tests). */
  paths?: number[][];
}

/**
 * Forward Monte Carlo simulation of `trials` sample paths, `horizon` steps
 * ahead, from a fitted model, optionally with a do-calculus style
 * intervention. Deterministic given the same seed.
 */
export function simulateMonteCarlo(
  fitted: FittedModel,
  lastValue: number,
  horizon: number,
  trials: number,
  seed: number,
  intervention?: InterventionSpec,
  returnPaths = false,
): SimulationResult {
  const rand = mulberry32(seed);
  const paths: number[][] = Array.from({ length: trials }, () => []);

  for (let trial = 0; trial < trials; trial++) {
    let value = lastValue;
    for (let step = 1; step <= horizon; step++) {
      const inIntervention = intervention != null && step >= intervention.fromStep;
      const stepSlope = inIntervention ? intervention!.delta : fitted.slope;
      const noise = fitted.residualStd * gaussian(rand);
      value = value + stepSlope + noise;
      paths[trial].push(value);
    }
  }

  const bands: SimulationBandPoint[] = [];
  for (let step = 1; step <= horizon; step++) {
    const valuesAtStep = paths.map((p) => p[step - 1]);
    bands.push({
      step,
      mean: mean(valuesAtStep),
      p10: percentile(valuesAtStep, 10),
      p50: percentile(valuesAtStep, 50),
      p90: percentile(valuesAtStep, 90),
    });
  }

  return returnPaths ? { bands, paths } : { bands };
}

export interface InMemoryBacktestPoint {
  cutoffIndex: number;
  targetIndex: number;
  p10: number;
  p50: number;
  p90: number;
  actual: number;
  withinInterval: boolean;
}

/**
 * Pure, DB-free sliding backtest over an in-memory series: for every cutoff
 * index with at least `minTrain` points before it and a ground-truth value
 * `horizon` steps later, fit on the train window only and compare the
 * simulated P10–P90 band to what actually happened. Used by `eval:worldmodel`
 * (no DB dependency, so the gate can run in CI) and by unit tests.
 */
export function backtestSeriesInMemory(
  points: ObservationPoint[],
  horizon: number,
  trials: number,
  seed: number,
  minTrain = 6,
): InMemoryBacktestPoint[] {
  const results: InMemoryBacktestPoint[] = [];
  for (let cutoffIndex = minTrain - 1; cutoffIndex + horizon < points.length; cutoffIndex++) {
    const train = points.slice(0, cutoffIndex + 1);
    const targetIndex = cutoffIndex + horizon;
    const fitted = fitLinearTrend(train);
    const lastValue = train[train.length - 1].value;
    // Mix the cutoff index into the seed so each sliding window draws an
    // independent-but-deterministic stream instead of replaying the same one.
    const windowSeed = (seed + cutoffIndex * 2654435761) >>> 0;
    const { bands } = simulateMonteCarlo(fitted, lastValue, horizon, trials, windowSeed);
    const band = bands[bands.length - 1];
    const actual = points[targetIndex].value;
    results.push({
      cutoffIndex,
      targetIndex,
      p10: band.p10,
      p50: band.p50,
      p90: band.p90,
      actual,
      withinInterval: actual >= band.p10 && actual <= band.p90,
    });
  }
  return results;
}
