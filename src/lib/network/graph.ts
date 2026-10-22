// LEADOS Part 31 — DB-backed graph loader. Converts eco_nodes/eco_edges rows into
// the pure EcosystemGraph shape consumed by metrics.ts, so the metric library
// itself never touches the database (keeps it unit-testable offline).

import { db } from "@/db";
import { ecosystemEdges, ecosystemNodes } from "@/db/schema";
import type { EcosystemGraph, EdgeType, GraphEdge, GraphNode, NodeType } from "./types";

export async function loadEcosystemGraph(): Promise<EcosystemGraph> {
  const [nodeRows, edgeRows] = await Promise.all([
    db.select().from(ecosystemNodes),
    db.select().from(ecosystemEdges),
  ]);

  const nodes: GraphNode[] = nodeRows.map((n) => ({
    id: n.id,
    type: n.type as NodeType,
    name: n.name,
    isExternal: n.isExternal,
    personId: n.personId,
    scopeTags: (n.scopeTags as string[]) ?? [],
  }));

  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges: GraphEdge[] = edgeRows
    .filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))
    .map((e) => ({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      edgeType: e.edgeType as EdgeType,
      strength: Number(e.strength),
      substitutability: Number(e.substitutability),
      evidenceClass: e.evidenceClass,
      evidenceRefs: (e.evidenceRefs as string[]) ?? [],
    }));

  return { nodes, edges };
}

export function nodeLabel(graph: EcosystemGraph, nodeId: string): string {
  return graph.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;
}
