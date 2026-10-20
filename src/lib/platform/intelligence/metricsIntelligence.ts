/**
 * metricsIntelligence.ts — Part 04-F orchestration layer: ties
 * `monteCarlo.ts` (simulate) + `forecastCache.ts` (cache by inputs-hash and
 * model-version) + `explain.ts` (never return a bare number) + CRPS
 * backtesting (score historical accuracy against what actually happened).
 * This is the single forecasting entry point other code should call.
 */

import { explainFinding } from "../../domain/intelligence/explain";
import { pearsonCorrelation, runMonteCarlo, type MonteCarloConfig } from "../../domain/intelligence/monteCarlo";
import { hashString } from "../../domain/intelligence/prng";
import { crpsEmpirical } from "../../domain/intelligence/stats";
import type { Explain, Forecast } from "../../domain/intelligence/types";
import { forecastCache } from "./forecastCache";

export const FORECAST_MODEL_VERSION = "monte-carlo-v1";

export type ForecastRequest = {
  label: string; // human label, e.g. "Q3 pipeline conversions"
  config: MonteCarloConfig;
  asOf: string;
  knownFailures?: string[];
};

function hashInputs(config: MonteCarloConfig): string {
  const serializable = config.inputs.map((i) => ({ ...i }));
  return hashString(JSON.stringify({ inputs: serializable, trials: config.trials, seed: config.seed, combine: config.combine.toString() }));
}

/**
 * Produce a forecast as `Explain<Forecast>`. Drivers are each input
 * assumption's Pearson correlation with the trial outcomes (how much of the
 * spread each assumption explains) — a simple, named, reproducible
 * sensitivity measure rather than a black-box "importance score".
 */
export function generateForecast(req: ForecastRequest): { explain: Explain<Forecast>; cacheHit: boolean } {
  const inputsHash = hashInputs(req.config);
  const { forecast, cacheHit } = forecastCache.getOrCompute(inputsHash, FORECAST_MODEL_VERSION, () => {
    const result = runMonteCarlo(req.config);
    const f: Forecast = {
      p10: result.p10,
      p50: result.p50,
      p90: result.p90,
      histogram: result.histogram,
      assumptions: result.assumptions,
      modelCard: {
        inputs: Object.fromEntries(req.config.inputs.map((i) => [i.name, i])),
        method: "Monte Carlo simulation (mulberry32 seeded PRNG, see prng.ts)",
        modelVersion: FORECAST_MODEL_VERSION,
        knownFailures: req.knownFailures ?? [
          "Assumes input distributions are independent; does not model joint/copula structure.",
          "Histogram resolution is fixed at construction time (default 20 bins).",
        ],
      },
      asOf: req.asOf,
      inputsHash,
    };
    // stash the raw sample/draw arrays on a WeakMap-like side channel is
    // overkill here; recompute drivers from a fresh small run isn't needed
    // because we still have `result` in this closure.
    (f as unknown as { __result?: typeof result }).__result = result;
    return f;
  });

  const result = (forecast as unknown as { __result?: ReturnType<typeof runMonteCarlo> }).__result;
  const sampleOutcomes = result?.samples ?? [];
  const drivers = req.config.inputs.map((input) => {
    const draws = result?.rawDraws[input.name] ?? [];
    const corr = sampleOutcomes.length ? pearsonCorrelation(draws, sampleOutcomes) : 0;
    return {
      factor: input.name,
      contribution: corr,
      direction: (corr >= 0 ? "up" : "down") as "up" | "down",
      evidence: [
        {
          id: `forecast-assumption:${input.name}`,
          kind: "metric" as const,
          sourceId: "monteCarlo",
          weightApplied: Math.abs(corr),
          observedAt: req.asOf,
          description: input.detail,
        },
      ],
    };
  });

  const explain = explainFinding<Forecast>({
    value: forecast,
    interval: { lo: forecast.p10, hi: forecast.p90 },
    drivers,
    evidence: drivers.flatMap((d) => d.evidence),
    method: `${forecast.modelCard.method} (${forecast.modelCard.modelVersion})`,
    asOf: req.asOf,
  });

  return { explain, cacheHit };
}

/**
 * CRPS backtest: given a forecast's sample set and what actually happened
 * (`actualValue`), score historical accuracy. Call this once the "future"
 * the forecast described has become observable `asOf` history (Part 01's
 * event envelope supplies the as-of timestamps in the real repository).
 */
export function backtestForecastCRPS(samples: number[], actualValue: number): number {
  return crpsEmpirical(samples, actualValue);
}
