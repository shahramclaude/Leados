import { explain, type ConfidenceClass } from "../core/explain";
import type { TwinConfig } from "../twin/types";
import type { MacroAssumption, Scenario, ScenarioQuadrant, StressShock } from "./types";

export interface BuildScenarioInput {
  id: string;
  name: string;
  narrative: string;
  narrativeConfidence: ConfidenceClass;
  authoredBy: string;
  quadrant?: ScenarioQuadrant;
  baseParameters: Record<string, number>;
  macroAssumptions: MacroAssumption[];
  shocks: StressShock[];
  planningWeight: number;
  seed: number;
  /** Fixed authored timestamp for reproducible seed scenarios; defaults to now for user-built ones. */
  authoredAt?: string;
}

/**
 * Build a typed scenario: a twin configuration + macro assumptions, exactly
 * the composition Part 24's brief calls for ("each scenario = typed twin
 * configuration + macro assumptions as Explain<T> inputs").
 */
export function buildScenario(input: BuildScenarioInput): Scenario {
  const twinConfig: TwinConfig = {
    id: `twin-${input.id}`,
    name: `${input.name} twin`,
    parameters: applyMacroDeltas(input.baseParameters, input.macroAssumptions),
    seed: input.seed,
  };

  return {
    id: input.id,
    name: input.name,
    quadrant: input.quadrant,
    narrative: explain(input.narrative, "Scenario narrative authored for wind-tunnel/war-game use.", input.narrativeConfidence, input.authoredBy, undefined, input.authoredAt),
    macroAssumptions: input.macroAssumptions,
    twinConfig,
    shocks: input.shocks,
    planningWeight: input.planningWeight,
    authoredAt: input.authoredAt ?? new Date().toISOString(),
    authoredBy: input.authoredBy,
  };
}

function applyMacroDeltas(base: Record<string, number>, assumptions: MacroAssumption[]): Record<string, number> {
  const out = { ...base };
  for (const a of assumptions) {
    for (const [key, delta] of Object.entries(a.parameterDeltas)) {
      out[key] = (out[key] ?? 0) + delta;
    }
  }
  return out;
}

/** Normalize an array of scenarios' planningWeight so they sum to 1 (needed by the wind tunnel). */
export function normalizePlanningWeights(scenarios: Scenario[]): Scenario[] {
  const total = scenarios.reduce((sum, s) => sum + s.planningWeight, 0);
  if (total <= 0) {
    const even = 1 / scenarios.length;
    return scenarios.map((s) => ({ ...s, planningWeight: even }));
  }
  return scenarios.map((s) => ({ ...s, planningWeight: s.planningWeight / total }));
}
