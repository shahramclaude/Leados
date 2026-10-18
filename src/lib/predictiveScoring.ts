// src/lib/predictiveScoring.ts
//
// Stage 5 of the orchestration pipeline: predictive scoring.
//
// Derives burnout-risk and flight-risk indices per person from the fused
// signal scores (Stage 4) plus the targeted Bayesian belief node for each
// risk type (Stage 2). Pure function, no DB access.
import type {
  BayesianUpdateResult,
  BurnoutRiskResult,
  FlightRiskResult,
  PersonRiskScore,
  RiskBand,
  SignalFusionResult,
} from "@/lib/types";

function bandFor(score: number): RiskBand {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "elevated";
  if (score >= 20) return "moderate";
  return "low";
}

function buildScores(
  fusion: SignalFusionResult,
  bayesianUpdate: BayesianUpdateResult,
  nodeKey: "burnout" | "flight_risk",
  driverLabel: string,
): PersonRiskScore[] {
  const beliefByPerson = new Map<number, number>();
  for (const belief of bayesianUpdate.beliefs) {
    if (belief.nodeKey === nodeKey) {
      beliefByPerson.set(belief.personId, belief.probability);
    }
  }

  return fusion.fusedSignals.map((fused) => {
    const beliefProbability = beliefByPerson.get(fused.personId) ?? 0;
    const score = Math.round((fused.riskScore * 0.6 + beliefProbability * 100 * 0.4) * 100) / 100;
    const drivers: string[] = [];
    if (fused.findingContribution > 40) drivers.push(`${driverLabel}: elevated findings load`);
    if (beliefProbability > 0.5) drivers.push(`${driverLabel}: belief probability ${Math.round(beliefProbability * 100)}%`);
    if (fused.causalContribution > 0) drivers.push(`${driverLabel}: reinforced by causal chain activity`);
    return {
      personId: fused.personId,
      score,
      band: bandFor(score),
      drivers,
    };
  });
}

export function computeBurnoutRiskIndex(
  fusion: SignalFusionResult,
  bayesianUpdate: BayesianUpdateResult,
): BurnoutRiskResult {
  const scores = buildScores(fusion, bayesianUpdate, "burnout", "Burnout");
  const orgAverage =
    scores.length > 0 ? Math.round((scores.reduce((s, x) => s + x.score, 0) / scores.length) * 100) / 100 : 0;
  return { computedAt: new Date().toISOString(), scores, orgAverage };
}

export function computeFlightRiskScores(
  fusion: SignalFusionResult,
  bayesianUpdate: BayesianUpdateResult,
): FlightRiskResult {
  const scores = buildScores(fusion, bayesianUpdate, "flight_risk", "Flight risk");
  const orgAverage =
    scores.length > 0 ? Math.round((scores.reduce((s, x) => s + x.score, 0) / scores.length) * 100) / 100 : 0;
  return { computedAt: new Date().toISOString(), scores, orgAverage };
}
