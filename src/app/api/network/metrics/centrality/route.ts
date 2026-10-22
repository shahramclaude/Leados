// Structural centrality — dependency-analysis signal only.
//
// HONESTY RULE: these numbers describe a node's position in the dependency
// graph, not a person's worth or authority over people. For internal_person
// nodes, the exact value is only returned to a caller who passes the
// `x-user-id` header of the subject themselves, their manager, or someone
// holding an explicit hr_admin/exec grant (see src/lib/network/privacy.ts).
// Everyone else receives a coarse low/medium/high band only.

import { computeCentrality } from "@/lib/network/metrics";
import { loadEcosystemGraph } from "@/lib/network/graph";
import { canViewPersonCentrality, maskCentrality } from "@/lib/network/privacy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requesterId = request.headers.get("x-user-id") ?? searchParams.get("requesterId") ?? "";

  const graph = await loadEcosystemGraph();
  const centrality = computeCentrality(graph);

  const results = await Promise.all(
    centrality.map(async (c) => {
      const node = graph.nodes.find((n) => n.id === c.nodeId)!;
      if (node.type !== "internal_person" || !node.personId) {
        // Non-person nodes (teams, partners, suppliers, customers, regulators)
        // are structural entities — no individual privacy concern.
        return { ...c, nodeName: node.name, nodeType: node.type, restricted: false };
      }

      const decision = await canViewPersonCentrality(requesterId, node.personId);
      const betweenness = maskCentrality(c.betweenness, decision.allowed);
      const eigenvector = maskCentrality(c.eigenvector, decision.allowed);

      return {
        nodeId: c.nodeId,
        nodeName: node.name,
        nodeType: node.type,
        restricted: !decision.allowed,
        accessReason: decision.reason,
        degree: decision.allowed ? c.degree : null,
        inDegree: decision.allowed ? c.inDegree : null,
        outDegree: decision.allowed ? c.outDegree : null,
        betweenness: betweenness.value,
        betweennessBand: betweenness.band,
        eigenvector: eigenvector.value,
        eigenvectorBand: eigenvector.band,
      };
    }),
  );

  return Response.json({
    requesterId: requesterId || null,
    note: "Centrality describes structural position in the dependency graph, not individual worth or influence over people.",
    results,
  });
}
