// src/lib/platform/lineage/store.ts
//
// DB-backed persistence + query API for the lineage graph. Known UI surfaces
// are pre-declared constants so "surface" nodes are stable, well-known
// targets (Part 32's footnotes link to `SURFACES.leadDetail` etc.).
import { randomUUID } from "crypto";
import { db } from "@/db";
import { lineageNodes, lineageEdges } from "@/db/schema";
import { eq, inArray, or } from "drizzle-orm";
import { traceLineage, type LineageEdge, type LineageNode } from "./graph";

export const SURFACES = {
  leadDetail: "surface:lead-detail",
  leadList: "surface:lead-list",
  qualityDashboard: "surface:quality-dashboard",
  exportFile: "surface:export-file",
} as const;

const surfaceNodeCache = new Map<string, string>();

async function ensureSurfaceNode(label: string): Promise<string> {
  if (surfaceNodeCache.has(label)) return surfaceNodeCache.get(label)!;
  const existing = await db
    .select()
    .from(lineageNodes)
    .where(eq(lineageNodes.label, label))
    .limit(1);
  if (existing[0]) {
    surfaceNodeCache.set(label, existing[0].id);
    return existing[0].id;
  }
  const id = randomUUID();
  await db.insert(lineageNodes).values({
    id,
    nodeType: "surface",
    refTable: null,
    refId: null,
    label,
    metadata: {},
  });
  surfaceNodeCache.set(label, id);
  return id;
}

export interface RecordLineageInput {
  sourceRefTable: string;
  sourceRefId: string;
  sourceLabel: string;
  transformLabel: string;
  transformMetadata?: Record<string, unknown>;
  projectionRefTable: string;
  projectionRefId: string;
  projectionLabel: string;
  surfaces: Array<keyof typeof SURFACES>;
}

/** Captures source -> transform -> projection -> surface edges for one derived value. */
export async function recordLineage(input: RecordLineageInput): Promise<void> {
  const sourceId = randomUUID();
  const transformId = randomUUID();
  const projectionId = randomUUID();

  await db.insert(lineageNodes).values([
    {
      id: sourceId,
      nodeType: "source",
      refTable: input.sourceRefTable,
      refId: input.sourceRefId,
      label: input.sourceLabel,
      metadata: {},
    },
    {
      id: transformId,
      nodeType: "transform",
      refTable: null,
      refId: null,
      label: input.transformLabel,
      metadata: input.transformMetadata ?? {},
    },
    {
      id: projectionId,
      nodeType: "projection",
      refTable: input.projectionRefTable,
      refId: input.projectionRefId,
      label: input.projectionLabel,
      metadata: {},
    },
  ]);

  const edgesToInsert: Array<{ id: string; fromNodeId: string; toNodeId: string }> = [
    { id: randomUUID(), fromNodeId: sourceId, toNodeId: transformId },
    { id: randomUUID(), fromNodeId: transformId, toNodeId: projectionId },
  ];

  for (const surfaceKey of input.surfaces) {
    const surfaceId = await ensureSurfaceNode(SURFACES[surfaceKey]);
    edgesToInsert.push({ id: randomUUID(), fromNodeId: projectionId, toNodeId: surfaceId });
  }

  await db.insert(lineageEdges).values(edgesToInsert);
}

/**
 * Links already-existing projection nodes (e.g. entities created during
 * import) to a surface, without fabricating new source/transform history.
 * Entities that have no projection node yet (never imported through the
 * pipeline) are skipped and reported, never silently linked.
 */
export async function linkExistingProjectionsToSurface(
  projectionRefTable: string,
  projectionRefIds: string[],
  surfaceKey: keyof typeof SURFACES
): Promise<{ linked: number; skipped: number }> {
  if (projectionRefIds.length === 0) return { linked: 0, skipped: 0 };
  const projectionNodes = await db
    .select()
    .from(lineageNodes)
    .where(eq(lineageNodes.refTable, projectionRefTable));
  const relevant = projectionNodes.filter((n) => n.nodeType === "projection" && projectionRefIds.includes(n.refId ?? ""));

  const surfaceId = await ensureSurfaceNode(SURFACES[surfaceKey]);
  if (relevant.length > 0) {
    await db.insert(lineageEdges).values(relevant.map((n) => ({ id: randomUUID(), fromNodeId: n.id, toNodeId: surfaceId })));
  }
  return { linked: relevant.length, skipped: projectionRefIds.length - relevant.length };
}

/** Traces every lineage chain for a given projection ref (e.g. an `entities.id`). */
export async function traceLineageForProjection(projectionRefTable: string, projectionRefId: string) {
  const projectionNodes = await db
    .select()
    .from(lineageNodes)
    .where(eq(lineageNodes.refTable, projectionRefTable));
  const relevantProjections = projectionNodes.filter((n) => n.refId === projectionRefId && n.nodeType === "projection");

  if (relevantProjections.length === 0) {
    return { found: false, chains: [], explanation: `No projection node found for ${projectionRefTable}:${projectionRefId}.` };
  }

  // Walk backward from projections to sources, and forward to surfaces, by
  // repeatedly expanding the node/edge frontier (bounded BFS — lineage chains
  // in this system are shallow by design: source -> transform -> projection -> surface).
  let frontierIds = relevantProjections.map((p) => p.id);
  const collectedNodeIds = new Set(frontierIds);
  const collectedEdges: LineageEdge[] = [];

  for (let hop = 0; hop < 6; hop++) {
    const incoming = await db.select().from(lineageEdges).where(inArray(lineageEdges.toNodeId, frontierIds));
    const outgoing = await db.select().from(lineageEdges).where(inArray(lineageEdges.fromNodeId, frontierIds));
    const newEdges = [...incoming, ...outgoing];
    if (newEdges.length === 0) break;
    const nextFrontier = new Set<string>();
    for (const e of newEdges) {
      collectedEdges.push({ id: e.id, fromNodeId: e.fromNodeId, toNodeId: e.toNodeId });
      if (!collectedNodeIds.has(e.fromNodeId)) nextFrontier.add(e.fromNodeId);
      if (!collectedNodeIds.has(e.toNodeId)) nextFrontier.add(e.toNodeId);
    }
    nextFrontier.forEach((id) => collectedNodeIds.add(id));
    frontierIds = Array.from(nextFrontier);
    if (frontierIds.length === 0) break;
  }

  const nodeRows = collectedNodeIds.size
    ? await db.select().from(lineageNodes).where(inArray(lineageNodes.id, Array.from(collectedNodeIds)))
    : [];

  const nodes: LineageNode[] = nodeRows.map((n) => ({
    id: n.id,
    nodeType: n.nodeType as LineageNode["nodeType"],
    refTable: n.refTable,
    refId: n.refId,
    label: n.label,
    metadata: (n.metadata as Record<string, unknown>) ?? {},
  }));

  // de-dupe edges
  const seenEdgeIds = new Set<string>();
  const dedupedEdges = collectedEdges.filter((e) => (seenEdgeIds.has(e.id) ? false : (seenEdgeIds.add(e.id), true)));

  return traceLineage(nodes, dedupedEdges);
}
