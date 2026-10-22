import { describe, expect, it } from "vitest";
import { runEnsemble, runScenario } from "../scenarioEngine";
import { SEED_SCENARIOS } from "../strategicScenarios";
import { detectSinglePointForecast } from "../anticipation";
import { normalizePlanningWeights } from "../simulationScenario";

describe("scenario ensemble reproducibility", () => {
  it("running the same scenario twice with the same config yields an identical trace", () => {
    const scenario = SEED_SCENARIOS[0];
    const a = runScenario(scenario, { ticks: 6 });
    const b = runScenario(scenario, { ticks: 6 });
    expect(a.trace.map((s) => s.metrics)).toEqual(b.trace.map((s) => s.metrics));
  });

  it("running the full ensemble twice yields the same matrix of final states", () => {
    const runA = runEnsemble(SEED_SCENARIOS, { ticks: 5 });
    const runB = runEnsemble(SEED_SCENARIOS, { ticks: 5 });
    expect(runA.map((r) => r.finalState.metrics)).toEqual(runB.map((r) => r.finalState.metrics));
    expect(runA.map((r) => r.scenarioId)).toEqual(SEED_SCENARIOS.map((s) => s.id));
  });

  it("different scenarios (different seeds/macro assumptions) produce different trajectories", () => {
    const a = runScenario(SEED_SCENARIOS[0], { ticks: 6 });
    const b = runScenario(SEED_SCENARIOS[1], { ticks: 6 });
    expect(a.finalState.metrics).not.toEqual(b.finalState.metrics);
  });
});

describe("planning-weight normalization", () => {
  it("normalizes an arbitrary set of positive weights to sum to 1", () => {
    const normalized = normalizePlanningWeights(SEED_SCENARIOS);
    const sum = normalized.reduce((s, sc) => s + sc.planningWeight, 0);
    expect(sum).toBeCloseTo(1, 9);
  });
});

describe("single-point-forecast guard", () => {
  it("flags a single scenario as a disguised single-point forecast", () => {
    const flag = detectSinglePointForecast([SEED_SCENARIOS[0]]);
    expect(flag.flagged).toBe(true);
  });

  it("does not flag a well-spread 5-scenario ensemble", () => {
    const flag = detectSinglePointForecast(SEED_SCENARIOS);
    expect(flag.flagged).toBe(false);
  });

  it("flags an ensemble where one scenario dominates planning weight", () => {
    const skewed = SEED_SCENARIOS.map((s, i) => ({ ...s, planningWeight: i === 0 ? 0.95 : 0.0125 }));
    const flag = detectSinglePointForecast(skewed);
    expect(flag.flagged).toBe(true);
  });
});
