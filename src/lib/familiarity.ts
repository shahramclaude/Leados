// src/lib/familiarity.ts
//
// NEW MODULE standing in for the "Part 1/2" familiarity model referenced
// by this brief (no prior file existed — see provenance note in
// src/lib/types.ts). Provides the skill-overlap (Jaccard) primitive the
// brief requires for succession-candidate matching, plus a lookup of
// pairwise collaboration strength from the org graph edges.

import type { OrgNetworkEdge, PersonId } from "./types";
import { jaccardSimilarity } from "./stats";

/**
 * Skill overlap between two people = Jaccard similarity of their skill
 * sets. CITATION: src/lib/stats.ts, jaccardSimilarity() (defined there,
 * see its own citation to Jaccard 1912).
 * Caller: src/lib/talentEngine.ts (computeSuccessionRisk, 1 call site).
 */
export function skillOverlap(a: string[], b: string[]): number {
  return jaccardSimilarity(a, b);
}

/**
 * Looks up the collaboration edge weight between two people from the org
 * network edge list (0 if no edge exists, i.e. no recorded collaboration).
 * Caller: src/lib/talentEngine.ts (computeTeamChemistry conflict
 * detection, 1 call site).
 */
export function computeFamiliarity(
  aId: PersonId,
  bId: PersonId,
  edges: OrgNetworkEdge[]
): number {
  const edge = edges.find(
    (e) => (e.source === aId && e.target === bId) || (e.source === bId && e.target === aId)
  );
  return edge ? edge.weight : 0;
}
