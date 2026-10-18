// src/lib/metricsEngine.ts
//
// Stage 6 of the orchestration pipeline: decision health index.
//
// Rolls up fusion, burnout, flight-risk and causal-chain outputs into a
// single 0-100 "decision health" score representing how reliable the org's
// current decision-making environment is likely to be (higher = healthier).
// Pure function, no DB access.
import type {
  BurnoutRiskResult,
  CausalChainResult,
  DecisionHealthComponent,
  DecisionHealthIndex,
  FlightRiskResult,
  SignalFusionResult,
} from "@/lib/types";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function computeDecisionHealthIndex(
  fusion: SignalFusionResult,
  burnout: BurnoutRiskResult,
  flightRisk: FlightRiskResult,
  causal: CausalChainResult,
): DecisionHealthIndex {
  const fusionHealth = clamp(100 - fusion.orgFusedScore, 0, 100);
  const burnoutHealth = clamp(100 - burnout.orgAverage, 0, 100);
  const flightHealth = clamp(100 - flightRisk.orgAverage, 0, 100);
  const causalHealth = clamp(100 - causal.chains.length * 5, 0, 100);

  const components: DecisionHealthComponent[] = [
    { label: "Signal fusion health", value: fusionHealth, weight: 0.35 },
    { label: "Burnout health", value: burnoutHealth, weight: 0.25 },
    { label: "Flight-risk health", value: flightHealth, weight: 0.25 },
    { label: "Causal volatility health", value: causalHealth, weight: 0.15 },
  ];

  const weightSum = components.reduce((s, c) => s + c.weight, 0) || 1;
  const score = Math.round((components.reduce((s, c) => s + c.value * c.weight, 0) / weightSum) * 100) / 100;

  return {
    computedAt: new Date().toISOString(),
    score,
    components,
  };
}
