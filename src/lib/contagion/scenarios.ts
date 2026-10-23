// Stress-scenario orchestration: wires the cascade engine to the three
// canonical stress types, and to the Part 06 / Part 24 seams (honestly
// reporting that those passes have not actually happened in this build).

import { computeSensitivityReport } from "./sensitivity";
import { runCascadeSimulation, type CascadeGraph, type CascadeParams } from "./cascade";
import { reconcileWithScenarioEnsemble } from "@/lib/seams/part24-scenario-engine";
import { validateAgainstTwin } from "@/lib/seams/part06-twin";

export type ScenarioType = "supplier_failure" | "demand_shock" | "regulatory_shock";

export const SCENARIO_DEFAULT_PARAMS: Record<ScenarioType, CascadeParams> = {
  supplier_failure: { baseProbabilityMultiplier: 1, correlatedShockFactor: 0.15, trials: 500 },
  demand_shock: { baseProbabilityMultiplier: 0.8, correlatedShockFactor: 0.35, trials: 500 },
  regulatory_shock: { baseProbabilityMultiplier: 0.6, correlatedShockFactor: 0.55, trials: 500 },
};

export interface StressRunOutput {
  systemicExposureScore: number;
  intervalLow: number;
  intervalHigh: number;
  sensitivity: Array<{ parameter: string; delta: number; exposureDelta: number }>;
  affectedNodeFrequency: Record<string, number>;
  twinValidated: boolean;
  ensembleReconciled: boolean;
  caveats: string[];
}

export function runStressScenario(
  graph: CascadeGraph,
  seedNodeIds: string[],
  type: ScenarioType,
  params: CascadeParams,
  seed: number,
): StressRunOutput {
  const result = runCascadeSimulation(graph, seedNodeIds, params, seed);
  const sensitivity = computeSensitivityReport(graph, seedNodeIds, params, seed, result.meanExposure);
  const twin = validateAgainstTwin();
  const ensemble = reconcileWithScenarioEnsemble();

  return {
    systemicExposureScore: result.meanExposure,
    intervalLow: result.intervalLow,
    intervalHigh: result.intervalHigh,
    sensitivity: sensitivity.map((s) => ({ parameter: s.parameter, delta: s.delta, exposureDelta: s.exposureDelta })),
    affectedNodeFrequency: result.affectedFrequency,
    twinValidated: twin.validated,
    ensembleReconciled: ensemble.reconciled,
    caveats: [
      "Independent-cascade model estimate with correlated-shock extension — not a verified operational forecast.",
      twin.note,
      ensemble.note,
      "Tail dependence is likely underestimated by this model class — see AI-SESSION-LOG.md / Attack-phase note.",
    ],
  };
}

export function scenarioTypeLabel(type: ScenarioType): string {
  switch (type) {
    case "supplier_failure":
      return "Supplier Failure Cascade";
    case "demand_shock":
      return "Demand Shock";
    case "regulatory_shock":
      return "Regulatory Shock";
  }
}
