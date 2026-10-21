// knowledgeGraph.ts — entity graph used for neighborhood expansion during
// hybrid retrieval (Part 11 seam: not present in the repo snapshot handed
// to this part, implemented here in the shape that seam is specified to
// own — edges between entities with a relation + weight).
import { db } from "@/db";
import { entities, graphEdges } from "@/db/schema";
import { eq, inArray, or } from "drizzle-orm";

export type GraphNeighbor = {
  entityId: string;
  name: string;
  relation: string;
  weight: number;
  hops: 1;
};

/** 1-hop neighborhood expansion from a set of seed entity ids, either direction. */
export async function expandNeighborhood(seedEntityIds: string[]): Promise<GraphNeighbor[]> {
  if (seedEntityIds.length === 0) return [];
  const edges = await db
    .select()
    .from(graphEdges)
    .where(or(inArray(graphEdges.fromEntityId, seedEntityIds), inArray(graphEdges.toEntityId, seedEntityIds)));

  const neighborIds = new Set<string>();
  for (const e of edges) {
    if (seedEntityIds.includes(e.fromEntityId) && !seedEntityIds.includes(e.toEntityId)) {
      neighborIds.add(e.toEntityId);
    }
    if (seedEntityIds.includes(e.toEntityId) && !seedEntityIds.includes(e.fromEntityId)) {
      neighborIds.add(e.fromEntityId);
    }
  }
  if (neighborIds.size === 0) return [];

  const neighborRows = await db.select().from(entities).where(inArray(entities.id, Array.from(neighborIds)));
  const nameById = new Map(neighborRows.map((r) => [r.id, r.name]));

  const results: GraphNeighbor[] = [];
  for (const e of edges) {
    const neighborId = seedEntityIds.includes(e.fromEntityId) ? e.toEntityId : e.fromEntityId;
    if (!neighborIds.has(neighborId)) continue;
    const name = nameById.get(neighborId);
    if (!name) continue;
    results.push({ entityId: neighborId, name, relation: e.relation, weight: Number(e.weight), hops: 1 });
  }
  return results;
}

export async function linkEntities(fromEntityId: string, toEntityId: string, relation: string, weight = 1) {
  return db.insert(graphEdges).values({ fromEntityId, toEntityId, relation, weight: weight.toFixed(3) }).returning();
}

export async function getEntityByName(name: string) {
  const [row] = await db.select().from(entities).where(eq(entities.name, name)).limit(1);
  return row;
}
