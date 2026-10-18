// src/lib/scenarioEngine.ts
//
// Stage 9 (final) of the orchestration pipeline: scenario scoring.
//
// Scores a fixed set of preset organizational scenarios against the current
// burnout/flight-risk/decision-health state, so leaders can see likely
// impact/likelihood/exposure before they happen. Pure function, no DB
// access.
import type {
  BurnoutRiskResult,
  DecisionHealthIndex,
  FlightRiskResult,
  ScenarioReport,
  ScenarioScore,
} from "@/lib/types";

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function scoreScenarios(
  burnout: BurnoutRiskResult,
  flightRisk: FlightRiskResult,
  decisionHealth: DecisionHealthIndex,
): ScenarioReport {
  const highFlightRisk = flightRisk.scores.filter((s) => s.score >= 60);
  const highBurnout = burnout.scores.filter((s) => s.score >= 60);

  const scenarios: ScenarioScore[] = [
    {
      id: "key-person-departure",
      name: "Key person departs",
      description: "One or more high flight-risk individuals leave within the next quarter.",
      likelihood: clamp01(flightRisk.orgAverage / 100),
      impactScore: Math.round(clamp01(0.5 + highFlightRisk.length * 0.1) * 100),
      exposure: Math.round(clamp01(flightRisk.orgAverage / 100) * clamp01(0.5 + highFlightRisk.length * 0.1) * 100),
      affectedPersonIds: highFlightRisk.map((s) => s.personId),
    },
    {
      id: "burnout-wave",
      name: "Burnout wave across a team",
      description: "Sustained workload and retention pressure trigger a cluster of burnout-driven attrition or output drops.",
      likelihood: clamp01(burnout.orgAverage / 100),
      impactScore: Math.round(clamp01(0.4 + highBurnout.length * 0.12) * 100),
      exposure: Math.round(clamp01(burnout.orgAverage / 100) * clamp01(0.4 + highBurnout.length * 0.12) * 100),
      affectedPersonIds: highBurnout.map((s) => s.personId),
    },
    {
      id: "hiring-freeze",
      name: "Hiring freeze",
      description: "An external hiring freeze forces the org to absorb departures without backfill.",
      likelihood: 0.3,
      impactScore: Math.round(clamp01(1 - decisionHealth.score / 100) * 100),
      exposure: Math.round(0.3 * clamp01(1 - decisionHealth.score / 100) * 100),
      affectedPersonIds: [],
    },
    {
      id: "reorg",
      name: "Organizational restructuring",
      description: "A reorg changes reporting lines and team composition, stressing an already-fragile decision environment.",
      likelihood: 0.25,
      impactScore: Math.round(clamp01(1 - decisionHealth.score / 100) * 100),
      exposure: Math.round(0.25 * clamp01(1 - decisionHealth.score / 100) * 100),
      affectedPersonIds: [],
    },
  ];

  scenarios.sort((a, b) => b.exposure - a.exposure);

  return {
    computedAt: new Date().toISOString(),
    scenarios,
  };
}
