// Value-chain extension: take Part 50's tier1 (direct partner) layer —
// standing in for Part 31's ecosystem graph per the seam note — and extend
// it to tier2/tier3 where data exists, honestly marking gaps rather than
// inferring fictitious suppliers.

import type { EvidenceClass } from "@/lib/seams/part27-evidence";

export interface ValueChainNode {
  id: number;
  name: string;
  tier: "self" | "tier1" | "tier2" | "tier3";
  role: "supplier" | "customer" | "self" | "partner";
  revenueWeight: number;
  dataConfidence: number;
  isGapFilled: boolean;
  evidenceClass: EvidenceClass;
}

export interface ValueChainEdge {
  id: number;
  fromNodeId: number;
  toNodeId: number;
  relationship: string;
  dependencyWeight: number;
  correlatedShockGroup: string | null;
  evidenceClass: EvidenceClass;
  isGapFilled: boolean;
}

export interface ValueChainGraph {
  nodes: ValueChainNode[];
  edges: ValueChainEdge[];
}

export interface CoverageReport {
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  gapFilledCount: number;
  tier2GapNote: string;
  tier3GapNote: string;
}

/**
 * Computes an honest coverage report so the UI never implies "we mapped the
 * whole value chain" when tier-2/3 data is sparse (this is the exact false
 * comfort the Attack phase calls out).
 */
export function computeCoverageReport(graph: ValueChainGraph): CoverageReport {
  const tier1Count = graph.nodes.filter((n) => n.tier === "tier1").length;
  const tier2Count = graph.nodes.filter((n) => n.tier === "tier2").length;
  const tier3Count = graph.nodes.filter((n) => n.tier === "tier3").length;
  const gapFilledCount = graph.nodes.filter((n) => n.isGapFilled).length;

  const expectedTier2Min = tier1Count; // heuristic floor: each tier1 node likely has >=1 upstream supplier
  const tier2GapNote =
    tier2Count < expectedTier2Min
      ? `Tier-2 coverage is sparse: ${tier2Count} known vs an expected floor of ~${expectedTier2Min} given ${tier1Count} tier-1 nodes. Absence of a tier-2/3 node is NOT evidence of no exposure — it is a data gap.`
      : `Tier-2 coverage looks structurally plausible (${tier2Count} nodes for ${tier1Count} tier-1 nodes), but completeness is not verified.`;

  const tier3GapNote =
    tier3Count === 0
      ? "No tier-3 data ingested. Tier-3 exposure is entirely unknown, not zero."
      : `Tier-3 coverage is partial (${tier3Count} nodes known); treat as a lower bound on tier-3 exposure, not a complete map.`;

  return { tier1Count, tier2Count, tier3Count, gapFilledCount, tier2GapNote, tier3GapNote };
}
