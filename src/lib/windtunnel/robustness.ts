import type { ScenarioWeight, UtilityMetricWeights } from "./types";
import { DEFAULT_UTILITY_WEIGHTS } from "./types";

export interface UtilityCell {
  strategyId: string;
  scenarioId: string;
  utility: number;
}

/**
 * Pure utility function over a twin's final metrics. Monotone in the
 * "good" direction of every input metric (more revenue growth, more
 * runway, more market share, less churn never decreases utility) — this
 * monotonicity is asserted by property tests.
 */
export function utility(finalMetrics: Record<string, number>, weights: UtilityMetricWeights = DEFAULT_UTILITY_WEIGHTS): number {
  const revenueTerm = (finalMetrics.revenueGrowth ?? 0) * 5;
  const cashTerm = (finalMetrics.cashRunwayMonths ?? 0) / 24;
  const churnTerm = 1 - clamp01(finalMetrics.churnRate ?? 0); // inverted: lower churn is better
  const shareTerm = (finalMetrics.marketShare ?? 0) * 5;

  return weights.revenueGrowth * revenueTerm + weights.cashRunwayMonths * cashTerm + weights.churnRate * churnTerm + weights.marketShare * shareTerm;
}

export interface WeightValidation {
  valid: boolean;
  sum: number;
  reason?: string;
}

/** Scenario ensemble weights must be non-negative and sum to 1. */
export function validateWeights(weights: ScenarioWeight[], epsilon = 1e-6): WeightValidation {
  if (weights.length === 0) return { valid: false, sum: 0, reason: "No weights provided." };
  if (weights.some((w) => w.weight < 0)) return { valid: false, sum: NaN, reason: "Negative weight is not allowed." };
  const sum = weights.reduce((s, w) => s + w.weight, 0);
  if (Math.abs(sum - 1) > epsilon) {
    return { valid: false, sum, reason: `Weights sum to ${sum.toFixed(6)}, expected 1.` };
  }
  return { valid: true, sum };
}

/** R(s) = Σ_scenarios w_scn · utility(s, scn) */
export function robustnessScore(strategyId: string, cells: UtilityCell[], weights: ScenarioWeight[]): number {
  const validation = validateWeights(weights);
  if (!validation.valid) {
    throw new Error(`Cannot compute robustness: ${validation.reason}`);
  }
  const weightMap = new Map(weights.map((w) => [w.scenarioId, w.weight]));
  const strategyCells = cells.filter((c) => c.strategyId === strategyId);
  let total = 0;
  for (const cell of strategyCells) {
    const w = weightMap.get(cell.scenarioId);
    if (w === undefined) throw new Error(`No ensemble weight registered for scenario "${cell.scenarioId}".`);
    total += w * cell.utility;
  }
  return total;
}

/** Regret of one cell = best utility achievable in that scenario (by any candidate strategy) minus this strategy's utility. Always >= 0 when the candidate set includes the best performer. */
export function regretForCell(cell: UtilityCell, cells: UtilityCell[]): number {
  const sceneCells = cells.filter((c) => c.scenarioId === cell.scenarioId);
  const best = Math.max(...sceneCells.map((c) => c.utility));
  return best - cell.utility;
}

export interface MaxRegretResult {
  strategyId: string;
  worstScenarioId: string;
  regret: number;
}

/** maxRegret(s) = max_scn (best_in_scn − utility(s, scn)) */
export function maxRegret(strategyId: string, cells: UtilityCell[]): MaxRegretResult {
  const strategyCells = cells.filter((c) => c.strategyId === strategyId);
  if (strategyCells.length === 0) {
    throw new Error(`No utility cells found for strategy "${strategyId}".`);
  }
  let worst: MaxRegretResult = { strategyId, worstScenarioId: strategyCells[0].scenarioId, regret: -Infinity };
  for (const cell of strategyCells) {
    const r = regretForCell(cell, cells);
    if (r > worst.regret) worst = { strategyId, worstScenarioId: cell.scenarioId, regret: r };
  }
  return worst;
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
