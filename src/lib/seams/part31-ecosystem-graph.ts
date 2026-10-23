// SEAM ADAPTER — Part 31 (Ecosystem Graph)
//
// STATUS: Part 31's source was not present in this repo snapshot (confirmed
// by full repo listing before writing code). Part 50 extends "Part 31's
// ecosystem graph ... beyond direct partners" — since the direct-partner
// graph doesn't exist here, this adapter defines the minimal node/edge shape
// we assume Part 31 produces, and Part 50's own `valueChainNodes` /
// `valueChainEdges` tables (tier1 rows) are treated as the Part-31-equivalent
// "direct partner" layer that tier2/tier3 extend. Replace `getDirectGraph`
// with a real call into Part 31 once that module exists.

export type EcosystemRole = "supplier" | "customer" | "partner" | "self";

export interface EcosystemNode {
  id: string;
  name: string;
  role: EcosystemRole;
}

export interface EcosystemEdge {
  fromId: string;
  toId: string;
  relationship: string;
  weight: number; // 0..1 baseline strength/dependency
}

export interface EcosystemGraph {
  nodes: EcosystemNode[];
  edges: EcosystemEdge[];
}

/**
 * Placeholder for Part 31's direct-partner graph fetch. Until Part 31 exists
 * in-repo, Part 50 sources its "tier1 = direct partner" layer from its own
 * `value_chain_nodes` table (role: supplier/customer/partner, tier: tier1),
 * which is explicitly labeled so nobody mistakes it for Part 31's real
 * ecosystem graph output.
 */
export function directGraphNotAvailableNotice(): string {
  return (
    "Part 31 ecosystem graph module not present in this repo snapshot. " +
    "Tier-1 nodes below are sourced from Part 50's own value-chain tables " +
    "and are clearly marked; they are a stand-in, not a read of Part 31's code."
  );
}
