/**
 * src/db/repositories/network.ts
 *
 * The org-network graph is unbounded in principle (N^2 possible edges at
 * 10x scale = ~5,000 people). Shipping the whole graph to the browser would
 * blow the bundle/response budget and the canvas render budget, so this
 * repository enforces a hard node cap server-side and documents the
 * degradation explicitly in the response (`truncated: true` + counts) so the
 * UI can render "showing top 150 of 1,240 relationships" instead of
 * silently clipping data.
 */
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { people, relationships } from "@/db/schema";

const MAX_EDGES = 150;

export interface NetworkGraph {
  nodes: { id: string; name: string; team: string; riskScore: number }[];
  edges: { source: string; target: string; weight: number }[];
  truncated: boolean;
  totalEdges: number;
}

export async function loadBoundedNetwork(tenantId: string): Promise<NetworkGraph> {
  const totalRow = await db
    .select({ total: sql<number>`count(*)` })
    .from(relationships)
    .where(eq(relationships.tenantId, tenantId));
  const totalEdges = Number(totalRow[0]?.total ?? 0);

  const topEdges = await db
    .select({
      source: relationships.sourcePersonId,
      target: relationships.targetPersonId,
      weight: relationships.weight,
    })
    .from(relationships)
    .where(eq(relationships.tenantId, tenantId))
    .orderBy(desc(relationships.weight))
    .limit(MAX_EDGES);

  const nodeIds = [...new Set(topEdges.flatMap((e) => [e.source, e.target]))];
  const nodes = nodeIds.length
    ? await db
        .select({ id: people.id, name: people.name, team: people.team, riskScore: people.riskScore })
        .from(people)
        .where(inArray(people.id, nodeIds))
    : [];

  return {
    nodes,
    edges: topEdges,
    truncated: totalEdges > MAX_EDGES,
    totalEdges,
  };
}
