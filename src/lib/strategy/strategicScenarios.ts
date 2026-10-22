// Named, pre-built strategic scenarios surfaced in the `strategic-scenarios`
// API/UI. These are starting points a strategy lead can clone and edit —
// not predictions. Running a scenario never mutates real data; it only
// recomputes derived views (see scenarioEngine.runScenario).
import type { ScenarioInput } from "./scenarioEngine";

export function budgetCutScenario(currentBudget: number, cutPercent: number): ScenarioInput {
  const newBudget = Math.round(currentBudget * (1 - cutPercent));
  return {
    id: `budget-cut-${Math.round(cutPercent * 100)}`,
    label: `Budget cut ${Math.round(cutPercent * 100)}% (to ${newBudget})`,
    baselineBudget: currentBudget,
    adjustments: [{ kind: "budget_change", newBudget }],
  };
}

export function budgetIncreaseScenario(currentBudget: number, increasePercent: number): ScenarioInput {
  const newBudget = Math.round(currentBudget * (1 + increasePercent));
  return {
    id: `budget-increase-${Math.round(increasePercent * 100)}`,
    label: `Budget increase ${Math.round(increasePercent * 100)}% (to ${newBudget})`,
    baselineBudget: currentBudget,
    adjustments: [{ kind: "budget_change", newBudget }],
  };
}

export function teamCapacityLossScenario(
  currentBudget: number,
  teamId: string,
  currentCapacity: number,
  lossPercent: number,
): ScenarioInput {
  const newCapacity = Math.round(currentCapacity * (1 - lossPercent));
  return {
    id: `capacity-loss-${teamId}-${Math.round(lossPercent * 100)}`,
    label: `Team capacity drops ${Math.round(lossPercent * 100)}% (e.g. attrition, leave)`,
    baselineBudget: currentBudget,
    adjustments: [{ kind: "team_capacity_change", teamId, newCapacityHoursPerWeek: newCapacity }],
  };
}

export function milestoneSlipScenario(
  currentBudget: number,
  milestoneId: string,
  extraDays: number,
): ScenarioInput {
  return {
    id: `milestone-slip-${milestoneId}-${extraDays}`,
    label: `Milestone slips by ${extraDays} days`,
    baselineBudget: currentBudget,
    adjustments: [{ kind: "milestone_delay", milestoneId, extraDays }],
  };
}
