import { describe, expect, it } from "vitest";
import { runWindTunnel } from "../runner";
import { SEED_STRATEGIES } from "../strategyLibrary";
import { SEED_SCENARIOS } from "../../scenarios/strategicScenarios";
import { normalizePlanningWeights } from "../../scenarios/simulationScenario";
import type { ScenarioWeight } from "../types";

/** Declared time budget for a 3-strategy x 5-scenario wind-tunnel run, per Phase 4 gate 5. */
const DECLARED_TIME_BUDGET_MS = 2000;

describe("wind-tunnel time budget", () => {
  it("completes a 3 strategy x 5 scenario ensemble within the declared budget", async () => {
    expect(SEED_STRATEGIES.length).toBe(3);
    expect(SEED_SCENARIOS.length).toBe(5);

    const weights: ScenarioWeight[] = normalizePlanningWeights(SEED_SCENARIOS).map((s) => ({ scenarioId: s.id, weight: s.planningWeight }));
    const result = await runWindTunnel(SEED_STRATEGIES, SEED_SCENARIOS, weights, 8);

    expect(result.cells.length).toBe(15); // 3 strategies * 5 scenarios
    expect(result.rankings.length).toBe(3);
    expect(result.elapsedMs).toBeLessThan(DECLARED_TIME_BUDGET_MS);
  });

  it("produces a reproducible ranking across repeated runs with the same inputs", async () => {
    const weights: ScenarioWeight[] = normalizePlanningWeights(SEED_SCENARIOS).map((s) => ({ scenarioId: s.id, weight: s.planningWeight }));
    const resultA = await runWindTunnel(SEED_STRATEGIES, SEED_SCENARIOS, weights, 8);
    const resultB = await runWindTunnel(SEED_STRATEGIES, SEED_SCENARIOS, weights, 8);
    expect(resultA.rankings.map((r) => r.strategyId)).toEqual(resultB.rankings.map((r) => r.strategyId));
    expect(resultA.cells).toEqual(resultB.cells);
  });

  it("every strategy's max regret is non-negative", async () => {
    const weights: ScenarioWeight[] = normalizePlanningWeights(SEED_SCENARIOS).map((s) => ({ scenarioId: s.id, weight: s.planningWeight }));
    const result = await runWindTunnel(SEED_STRATEGIES, SEED_SCENARIOS, weights, 8);
    for (const ranking of result.rankings) {
      expect(ranking.maxRegret.regret).toBeGreaterThanOrEqual(-1e-9);
    }
  });
});
