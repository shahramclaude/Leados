import { runScenario } from "../scenarios/scenarioEngine";
import type { Scenario } from "../scenarios/types";
import { maxRegret, robustnessScore, utility, validateWeights, type MaxRegretResult, type UtilityCell } from "./robustness";
import type { ScenarioWeight, Strategy } from "./types";

export interface StrategyRanking {
  strategyId: string;
  strategyName: string;
  robustness: number;
  maxRegret: MaxRegretResult;
  utilityByScenario: Record<string, number>;
}

export interface WindTunnelResult {
  cells: UtilityCell[];
  rankings: StrategyRanking[];
  elapsedMs: number;
  ticks: number;
  strategyCount: number;
  scenarioCount: number;
  runAt: string;
}

/**
 * Execute every strategy against every scenario in the ensemble
 * ("wind-tunneling"), then compute robustness and max-regret per strategy.
 * Scenario runs are independent and seeded — safe to parallelize, and
 * reproducible given the same strategies/scenarios/ticks/seed.
 */
export async function runWindTunnel(
  strategies: Strategy[],
  scenarios: Scenario[],
  weights: ScenarioWeight[],
  ticks: number
): Promise<WindTunnelResult> {
  const validation = validateWeights(weights);
  if (!validation.valid) {
    throw new Error(`Wind tunnel aborted: ${validation.reason}`);
  }

  const start = performance.now();

  const cellPromises: Promise<UtilityCell>[] = [];
  for (const strategy of strategies) {
    for (const scenario of scenarios) {
      cellPromises.push(
        Promise.resolve().then(() => {
          const result = runScenario(scenario, { ticks, strategyDeltas: strategy.twinDeltas });
          return { strategyId: strategy.id, scenarioId: scenario.id, utility: utility(result.finalState.metrics) };
        })
      );
    }
  }
  const cells = await Promise.all(cellPromises);
  const elapsedMs = performance.now() - start;

  const rankings: StrategyRanking[] = strategies
    .map((strategy) => {
      const utilityByScenario: Record<string, number> = {};
      for (const cell of cells.filter((c) => c.strategyId === strategy.id)) {
        utilityByScenario[cell.scenarioId] = cell.utility;
      }
      return {
        strategyId: strategy.id,
        strategyName: strategy.name,
        robustness: robustnessScore(strategy.id, cells, weights),
        maxRegret: maxRegret(strategy.id, cells),
        utilityByScenario,
      };
    })
    .sort((a, b) => b.robustness - a.robustness);

  return {
    cells,
    rankings,
    elapsedMs,
    ticks,
    strategyCount: strategies.length,
    scenarioCount: scenarios.length,
    runAt: new Date().toISOString(),
  };
}
