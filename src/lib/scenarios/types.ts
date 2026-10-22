import type { Explain } from "../core/explain";
import type { TwinConfig } from "../twin/types";

export interface ScenarioAxis {
  id: string;
  name: string;
  lowLabel: string;
  highLabel: string;
  description: string;
}

export type AxisSide = "low" | "high";

export interface ScenarioQuadrant {
  axisXId: string;
  axisXSide: AxisSide;
  axisYId: string;
  axisYSide: AxisSide;
}

export interface MacroAssumption {
  id: string;
  dimension: "market" | "regulation" | "competition" | "technology" | "talent";
  assumption: Explain<string>;
  /** How this assumption perturbs twin operating parameters. */
  parameterDeltas: Record<string, number>;
}

export interface StressShock {
  id: string;
  label: string;
  description: string;
  appliesAtTick: number;
  parameterDeltas: Record<string, number>;
}

export interface Scenario {
  id: string;
  /** Named world, e.g. "Fragmented Frontier". Named deliberately, not "Scenario 1". */
  name: string;
  quadrant?: ScenarioQuadrant;
  narrative: Explain<string>;
  macroAssumptions: MacroAssumption[];
  twinConfig: TwinConfig;
  shocks: StressShock[];
  /**
   * Ensemble weighting used for wind-tunnel robustness math. This is a
   * PLANNING WEIGHT (how much attention/robustness-credit the scenario gets
   * in testing), not a probability estimate of occurrence. Keeping it out of
   * the "likelihood" vocabulary is deliberate — see POSSIBILITY_DISCLAIMER.
   */
  planningWeight: number;
  authoredAt: string;
  authoredBy: string;
}
