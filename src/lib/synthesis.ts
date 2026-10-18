// src/lib/synthesis.ts
//
// Stage 8 of the orchestration pipeline: narrative synthesis.
//
// Combines predictive-scoring and knowledge-graph outputs into a flat list
// of human-readable narrative items via narrativeIntel.ts helpers. Pure
// function, no DB access.
import { narrateNetwork, narrateTopBurnout, narrateTopFlightRisks } from "@/lib/narrativeIntel";
import type { BurnoutRiskResult, FlightRiskResult, NarrativeReport, OrgNetworkReport } from "@/lib/types";

export function synthesizeNarratives(
  burnout: BurnoutRiskResult,
  flightRisk: FlightRiskResult,
  network: OrgNetworkReport,
): NarrativeReport {
  const narratives = [
    ...narrateTopFlightRisks(flightRisk),
    ...narrateTopBurnout(burnout),
    ...narrateNetwork(network),
  ];

  return {
    computedAt: new Date().toISOString(),
    narratives,
  };
}
