// src/lib/orgODE.ts
//
// NEW MODULE standing in for the "Part 2" org-dynamics ODE engine
// referenced by this brief (no prior file existed — see provenance note
// in src/lib/types.ts). A literal multi-variable ODE integrator is out of
// scope for what Part 3 needs (a single cohesionScore per team), so this
// implements a deliberately simplified closed-form proxy that mimics a
// damped-dynamics intuition: cohesion rises with average tie strength and
// density, and decays with isolation. Disclosed as a simplification,
// UNVERIFIED (original heuristic authored this session) rather than a
// literal differential-equation solve.

import type { OrgNetworkEdge, PersonId } from "./types";

export interface OrgDynamicsResult {
  cohesionScore: number; // 0-100
  stabilityIndex: number; // 0-1
  trend: "rising" | "flat" | "falling";
}

/**
 * Caller: src/lib/talentEngine.ts (computeTeamChemistry, 1 call site).
 */
export function fastOrgDynamics(nodeIds: PersonId[], edges: OrgNetworkEdge[]): OrgDynamicsResult {
  const n = nodeIds.length;
  if (n <= 1) {
    return { cohesionScore: n === 1 ? 50 : 0, stabilityIndex: n === 1 ? 0.5 : 0, trend: "flat" };
  }

  const relevantEdges = edges.filter(
    (e) => nodeIds.includes(e.source) && nodeIds.includes(e.target)
  );
  const maxPossibleEdges = (n * (n - 1)) / 2;
  const density = maxPossibleEdges > 0 ? relevantEdges.length / maxPossibleEdges : 0;
  const avgWeight =
    relevantEdges.length > 0
      ? relevantEdges.reduce((sum, e) => sum + e.weight, 0) / relevantEdges.length
      : 0;

  // Degree-based isolation penalty: fraction of nodes with no edge at all
  // within this team subgraph.
  const degree = new Map<PersonId, number>(nodeIds.map((id) => [id, 0]));
  for (const e of relevantEdges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const isolatedFraction = nodeIds.filter((id) => (degree.get(id) ?? 0) === 0).length / n;

  const cohesionRaw = 0.5 * density + 0.5 * avgWeight - 0.3 * isolatedFraction;
  const cohesionScore = Math.max(0, Math.min(100, cohesionRaw * 100));

  const stabilityIndex = Math.max(0, Math.min(1, avgWeight * (1 - isolatedFraction)));

  const trend: OrgDynamicsResult["trend"] =
    cohesionScore >= 65 ? "rising" : cohesionScore >= 40 ? "flat" : "falling";

  return { cohesionScore, stabilityIndex, trend };
}
