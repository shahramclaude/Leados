// src/lib/twin/orgSimulation.ts
//
// Runs ONE full discrete-time simulation (weekly steps) for a given scenario
// and seed, deriving independent per-component RNG streams via
// seedHash(runId, component) so e.g. resampling the network for attribution
// does not perturb the arrival process for the same run.

import type { ScenarioInput, SimulationRunResult, WeeklyMetrics } from "./types";
import { createRng } from "./prng";
import { createInitialOrgState } from "./digitalTwin";
import { deriveStepRngs, stepWeek } from "./orgDynamics";

export function runSingleSimulation(
  scenario: ScenarioInput,
  seed: number,
  antithetic: boolean,
  runId: string,
): SimulationRunResult {
  // World generation uses its own un-antithetic stream (initial org structure
  // should not flip with antithetic variates — only the weekly stochastic
  // process does, per standard practice of only mirroring the "response"
  // draws, not the fixed scenario setup).
  let state = createInitialOrgState(scenario, seed);

  const rootRng = createRng(seed, antithetic);
  const weeks: WeeklyMetrics[] = [];
  let cumulativeNetValue = 0;
  let totalArrivals = 0;

  for (let week = 1; week <= scenario.horizonWeeks; week++) {
    const rngs = deriveStepRngs(seed, week, (label) => rootRng.child(label));
    const { state: nextState, metrics } = stepWeek(state, scenario, week, rngs);
    cumulativeNetValue += metrics.netValueThisWeek;
    metrics.cumulativeNetValue = cumulativeNetValue;
    totalArrivals += metrics.arrivalsThisWeek;
    weeks.push(metrics);
    state = nextState;
  }

  return { runId, seed, antithetic, weeks, totalArrivals };
}
