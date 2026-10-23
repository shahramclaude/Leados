// Scenario comparison / wind-tunnel extension (Part 24 lineage) applied to
// org structures: lay multiple structural-move outcomes side by side across
// the three mandatory dimensions — delivery, network, human — never reduced
// to one "winner" score.

import type { DeliveryImpact, Explain, HumanImpactSummary, NetworkImpact } from "./types";

export type ScenarioResult = {
  simulationRunId: number;
  label: string;
  deliveryImpact: DeliveryImpact;
  networkImpact: NetworkImpact;
  humanImpactSummary: HumanImpactSummary;
};

export type ScenarioComparisonRow = {
  simulationRunId: number;
  label: string;
  capacityChangePct: Explain<number>;
  cycleTimeChangeDays: Explain<number>;
  cohesionChange: Explain<number>;
  busFactor: Explain<number>;
  chokePointCount: number;
  totalPeopleAffected: number;
  severeOrHighCount: number;
  unsupportedSevereOrHigh: number;
};

export function compareScenarios(results: ScenarioResult[]): ScenarioComparisonRow[] {
  return results.map((r) => ({
    simulationRunId: r.simulationRunId,
    label: r.label,
    capacityChangePct: r.deliveryImpact.capacityChangePct,
    cycleTimeChangeDays: r.deliveryImpact.cycleTimeChangeDays,
    cohesionChange: r.networkImpact.cohesion,
    busFactor: r.networkImpact.busFactor,
    chokePointCount: r.networkImpact.chokePoints.length,
    totalPeopleAffected: r.humanImpactSummary.totalAffected,
    severeOrHighCount: r.humanImpactSummary.byDisruptionClass.severe + r.humanImpactSummary.byDisruptionClass.high,
    unsupportedSevereOrHigh: r.humanImpactSummary.unsupportedSevereOrHigh,
  }));
}

/**
 * Explicitly refuses to produce a single ranked "best scenario" score.
 * Scenario theater (picking the model that justifies a predetermined
 * outcome) is resisted structurally by never emitting a scalar ranking —
 * only the comparison table above, which a human must read across all three
 * dimensions. See AI-SESSION-LOG.md PHASE 5 answer #1.
 */
export const NO_SINGLE_SCORE_POLICY =
  "This module intentionally does not rank scenarios by a single number. Compare the table across delivery, network and human dimensions.";
