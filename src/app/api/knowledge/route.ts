import { db } from "@/db";
import * as schema from "@/db/schema";
import { ensureBaselineData } from "@/lib/seed";
import { withErrorHandling, jsonOk } from "@/lib/api";
import { findRootCauses, knowledgeHalfLife, jaccardPatternMatch, type KnowledgeGraph } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("knowledge", async (_req, requestId) => {
  await ensureBaselineData(db);

  const nodeRows = await db.select().from(schema.knowledgeNodes);
  const edgeRows = await db.select().from(schema.knowledgeEdges);

  const graph: KnowledgeGraph = {
    nodes: nodeRows.map((n) => ({ id: n.id, label: n.label, domain: n.domain, severity: n.severity, tags: n.tags })),
    edges: edgeRows.map((e) => ({ fromId: e.fromId, toId: e.toId, relation: e.relation, weight: e.weight })),
  };

  const rootCausesByNode = graph.nodes.map((n) => ({
    nodeId: n.id,
    rootCauses: findRootCauses(graph, n.id).map((r) => r.id),
  }));

  const halfLife = knowledgeHalfLife(graph);

  const similarPairs: { a: number; b: number; similarity: number }[] = [];
  for (let i = 0; i < graph.nodes.length; i++) {
    for (let j = i + 1; j < graph.nodes.length; j++) {
      similarPairs.push({ a: graph.nodes[i].id, b: graph.nodes[j].id, similarity: jaccardPatternMatch(graph.nodes[i], graph.nodes[j]) });
    }
  }

  return jsonOk({ graph, rootCausesByNode, halfLife, similarPairs }, requestId);
});
