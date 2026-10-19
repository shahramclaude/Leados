// org_design — organizational design efficiency model.
//
// Uses one verifiable, citable piece of real management theory — Graicunas'
// (1933) formula for the number of possible superior-subordinate
// relationship permutations as a function of span of control — plus
// original, disclosed heuristics for coordination cost and decision
// latency (not citable to a specific paper; clearly labeled as such).
//
// WIRED: src/lib/peopleIntelligence.ts derives headcount/layers/avgSpan from
// the live roster + relationships graph and folds `efficiencyScore` into
// TeamDynamicsReport.orgDesignEfficiency — no longer orphaned.

import { clamp, round1 } from "./mathUtils";

export interface OrgDesignInputs {
  headcount: number;
  layers: number;
  avgSpan: number;
}

export interface OrgDesignResult {
  layers: number;
  avgSpan: number;
  headcount: number;
  estimatedManagers: number;
  graicunasRelationships: number;
  idealSpanBand: [number, number];
  spanFit: "too narrow" | "ideal" | "too wide";
  coordinationCost: number; // 0-100, higher = more overhead
  decisionLatencyDays: number;
  efficiencyScore: number; // 0-100
}

/** Graicunas (1933): direct + cross + group relationships for n subordinates. */
export function graicunasRelationships(span: number): number {
  const n = Math.max(0, span);
  return Math.round(n * (Math.pow(2, n) / 2 + n - 1));
}

export function computeOrgDesign(input: OrgDesignInputs): OrgDesignResult {
  const { headcount, layers, avgSpan } = input;
  const idealSpanBand: [number, number] = [5, 9]; // widely-cited "ideal" management-literature band

  const spanFit: OrgDesignResult["spanFit"] =
    avgSpan < idealSpanBand[0] ? "too narrow" : avgSpan > idealSpanBand[1] ? "too wide" : "ideal";

  // Rough manager estimate: headcount distributed across layers with avgSpan branching factor.
  const estimatedManagers = Math.max(1, Math.round(headcount / Math.max(1, avgSpan)));

  const relationships = graicunasRelationships(Math.min(avgSpan, 12)); // capped for numeric sanity

  // Original, disclosed heuristic: coordination cost rises with layers and with span distance from ideal.
  const spanPenalty =
    avgSpan < idealSpanBand[0]
      ? (idealSpanBand[0] - avgSpan) * 6
      : avgSpan > idealSpanBand[1]
      ? (avgSpan - idealSpanBand[1]) * 5
      : 0;
  const coordinationCost = clamp((layers - 1) * 9 + spanPenalty);

  // Original, disclosed heuristic: each extra layer adds ~0.6 days of decision latency.
  const decisionLatencyDays = round1(1 + (layers - 1) * 0.6 + spanPenalty / 20);

  const efficiencyScore = clamp(100 - coordinationCost * 0.7 - (decisionLatencyDays - 1) * 4);

  return {
    layers,
    avgSpan,
    headcount,
    estimatedManagers,
    graicunasRelationships: relationships,
    idealSpanBand,
    spanFit,
    coordinationCost: round1(coordinationCost),
    decisionLatencyDays,
    efficiencyScore: round1(efficiencyScore),
  };
}

export function orgDesignSignal(input: OrgDesignInputs): number {
  return computeOrgDesign(input).efficiencyScore;
}
