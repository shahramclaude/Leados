// src/lib/knowledgeGraph.ts
//
// The organization's knowledge graph: entities (people, projects, decisions,
// hypotheses, metrics, risks, playbooks) connected by typed relations
// (caused, blocked, informs, supersedes, owns). Relations are extracted
// EXPLICITLY from structured event payloads (never from free/private text)
// via `extractRelationsFromEvent`.
//
// This module is split into:
//   1. Pure graph algorithms (no DB) — neighbors, shortest path, blast
//      radius, orphan detection — so they are trivially unit-testable
//      against fixture graphs.
//   2. DB-backed helpers that load the graph from Postgres and expose the
//      same operations by entity `key`.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { entities, events, relations } from "@/db/schema";
import { indexDocument } from "@/lib/search";

export const RELATION_TYPES = ["caused", "blocked", "informs", "supersedes", "owns"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const ENTITY_TYPES = [
  "person",
  "project",
  "decision",
  "hypothesis",
  "metric",
  "risk",
  "playbook",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** Confidence decays 0.9 per hop away from the originating entity. */
export const CONFIDENCE_DECAY_PER_HOP = 0.9;

// ─────────────────────────────────────────────────────────────────────────
// Pure graph types + algorithms
// ─────────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: number;
  key: string;
  type: string;
  name: string;
}

export interface GraphEdge {
  id: number;
  from: number;
  to: number;
  type: string;
  weight: number;
}

export interface NeighborResult {
  nodeIds: number[];
  edges: GraphEdge[];
}

/** Undirected BFS up to `depth` hops from `startId`. */
export function bfsNeighbors(edges: GraphEdge[], startId: number, depth: number): NeighborResult {
  const adjacency = new Map<number, GraphEdge[]>();
  for (const e of edges) {
    adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e]);
    adjacency.set(e.to, [...(adjacency.get(e.to) ?? []), e]);
  }
  const visited = new Set<number>([startId]);
  const resultEdges: GraphEdge[] = [];
  const resultEdgeIds = new Set<number>();
  let frontier = [startId];
  for (let hop = 0; hop < depth && frontier.length > 0; hop++) {
    const next: number[] = [];
    for (const nodeId of frontier) {
      for (const e of adjacency.get(nodeId) ?? []) {
        if (!resultEdgeIds.has(e.id)) {
          resultEdgeIds.add(e.id);
          resultEdges.push(e);
        }
        const other = e.from === nodeId ? e.to : e.from;
        if (!visited.has(other)) {
          visited.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  visited.delete(startId);
  return { nodeIds: [...visited], edges: resultEdges };
}

export interface PathResult {
  nodeIds: number[];
  edgeIds: number[];
  hops: number;
}

/**
 * Shortest *directed* influence path from `fromId` to `toId` (BFS over
 * relation direction, since relations like "caused"/"blocked"/"informs"
 * represent a direction of influence). Returns null if unreachable.
 */
export function shortestInfluencePath(edges: GraphEdge[], fromId: number, toId: number): PathResult | null {
  if (fromId === toId) return { nodeIds: [fromId], edgeIds: [], hops: 0 };
  const adjacency = new Map<number, GraphEdge[]>();
  for (const e of edges) {
    adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e]);
  }
  const visited = new Set<number>([fromId]);
  const queue: { id: number; path: number[]; edgeIds: number[] }[] = [{ id: fromId, path: [fromId], edgeIds: [] }];
  while (queue.length > 0) {
    const { id, path, edgeIds } = queue.shift()!;
    for (const e of adjacency.get(id) ?? []) {
      if (visited.has(e.to)) continue;
      const nextPath = [...path, e.to];
      const nextEdgeIds = [...edgeIds, e.id];
      if (e.to === toId) return { nodeIds: nextPath, edgeIds: nextEdgeIds, hops: nextEdgeIds.length };
      visited.add(e.to);
      queue.push({ id: e.to, path: nextPath, edgeIds: nextEdgeIds });
    }
  }
  return null;
}

export interface BlastRadiusEntry {
  id: number;
  hops: number;
  confidence: number;
}

/**
 * Forward-directed "what else is affected if this changes" BFS from
 * `startId`, up to `maxDepth` hops, decaying confidence by
 * CONFIDENCE_DECAY_PER_HOP per hop.
 */
export function blastRadius(edges: GraphEdge[], startId: number, maxDepth = 5): BlastRadiusEntry[] {
  const adjacency = new Map<number, GraphEdge[]>();
  for (const e of edges) {
    adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e]);
  }
  const visited = new Map<number, BlastRadiusEntry>();
  let frontier = [startId];
  const seen = new Set<number>([startId]);
  for (let hop = 1; hop <= maxDepth && frontier.length > 0; hop++) {
    const next: number[] = [];
    for (const nodeId of frontier) {
      for (const e of adjacency.get(nodeId) ?? []) {
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        visited.set(e.to, { id: e.to, hops: hop, confidence: Math.pow(CONFIDENCE_DECAY_PER_HOP, hop) });
        next.push(e.to);
      }
    }
    frontier = next;
  }
  return [...visited.values()].sort((a, b) => a.hops - b.hops);
}

/** Entities with no relation (incoming or outgoing) at all. */
export function findOrphans(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const connected = new Set<number>();
  for (const e of edges) {
    connected.add(e.from);
    connected.add(e.to);
  }
  return nodes.filter((n) => !connected.has(n.id));
}

/** Jaccard similarity between two sets: |A ∩ B| / |A ∪ B|. */
export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─────────────────────────────────────────────────────────────────────────
// DB-backed graph loading + mutation
// ─────────────────────────────────────────────────────────────────────────

export interface EntityInput {
  key: string;
  type: EntityType | string;
  name: string;
  description?: string;
  attributes?: Record<string, unknown>;
}

export async function upsertEntity(input: EntityInput) {
  const [row] = await db
    .insert(entities)
    .values({
      key: input.key,
      type: input.type,
      name: input.name,
      description: input.description ?? null,
      attributes: input.attributes ?? {},
    })
    .onConflictDoUpdate({
      target: entities.key,
      set: {
        type: input.type,
        name: input.name,
        description: input.description ?? null,
        attributes: input.attributes ?? {},
        updatedAt: new Date(),
      },
    })
    .returning();
  await indexDocument({
    sourceType: "entity",
    sourceId: row.id,
    title: row.name,
    body: `${row.description ?? ""} (${row.type})`,
    tags: [row.type],
    recencyAt: row.updatedAt,
  });
  return row;
}

export interface RelationInput {
  fromKey: string;
  toKey: string;
  type: RelationType | string;
  weight?: number;
  metadata?: Record<string, unknown>;
  sourceEventId?: number;
}

/** Insert a relation, avoiding exact (from,to,type) duplicates by bumping weight instead. */
export async function upsertRelation(input: RelationInput) {
  const [fromEntity] = await db.select().from(entities).where(eq(entities.key, input.fromKey)).limit(1);
  const [toEntity] = await db.select().from(entities).where(eq(entities.key, input.toKey)).limit(1);
  if (!fromEntity || !toEntity) {
    throw new Error(`upsertRelation: unknown entity key(s) ${input.fromKey} -> ${input.toKey}`);
  }
  const [existing] = await db
    .select()
    .from(relations)
    .where(
      and(
        eq(relations.fromEntityId, fromEntity.id),
        eq(relations.toEntityId, toEntity.id),
        eq(relations.type, input.type)
      )
    )
    .limit(1);
  if (existing) {
    const [row] = await db
      .update(relations)
      .set({ weight: existing.weight + (input.weight ?? 1), metadata: { ...(existing.metadata as object), ...(input.metadata ?? {}) } })
      .where(eq(relations.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(relations)
    .values({
      fromEntityId: fromEntity.id,
      toEntityId: toEntity.id,
      type: input.type,
      weight: input.weight ?? 1,
      metadata: input.metadata ?? {},
      sourceEventId: input.sourceEventId ?? null,
    })
    .returning();
  return row;
}

export async function loadGraph(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const entityRows = await db.select().from(entities);
  const relationRows = await db.select().from(relations);
  return {
    nodes: entityRows.map((e) => ({ id: e.id, key: e.key, type: e.type, name: e.name })),
    edges: relationRows.map((r) => ({ id: r.id, from: r.fromEntityId, to: r.toEntityId, type: r.type, weight: r.weight })),
  };
}

async function entityIdForKey(key: string): Promise<number | null> {
  const [row] = await db.select({ id: entities.id }).from(entities).where(eq(entities.key, key)).limit(1);
  return row?.id ?? null;
}

export async function getNeighbors(key: string, depth = 1) {
  const { nodes, edges } = await loadGraph();
  const id = await entityIdForKey(key);
  if (id === null) return { nodes: [], edges: [] };
  const { nodeIds, edges: hitEdges } = bfsNeighbors(edges, id, depth);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  return { nodes: nodeIds.map((nid) => nodeById.get(nid)).filter(Boolean) as GraphNode[], edges: hitEdges };
}

export async function getShortestPath(fromKey: string, toKey: string) {
  const { nodes, edges } = await loadGraph();
  const fromId = await entityIdForKey(fromKey);
  const toId = await entityIdForKey(toKey);
  if (fromId === null || toId === null) return null;
  const result = shortestInfluencePath(edges, fromId, toId);
  if (!result) return null;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  return {
    hops: result.hops,
    nodes: result.nodeIds.map((nid) => nodeById.get(nid)!),
    edges: result.edgeIds.map((eid) => edgeById.get(eid)!),
  };
}

export async function getBlastRadius(key: string, maxDepth = 5) {
  const { nodes, edges } = await loadGraph();
  const id = await entityIdForKey(key);
  if (id === null) return [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  return blastRadius(edges, id, maxDepth)
    .map((entry) => ({ ...entry, entity: nodeById.get(entry.id) }))
    .filter((entry) => entry.entity);
}

export async function getOrphans() {
  const { nodes, edges } = await loadGraph();
  return findOrphans(nodes, edges);
}

/** Degree (connection count) per entity id — used as the graph-rank signal for search. */
export async function getDegreeMap(): Promise<Map<number, number>> {
  const { edges } = await loadGraph();
  const degree = new Map<number, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  return degree;
}

// ─────────────────────────────────────────────────────────────────────────
// Explicit extraction from structured events (never from private content).
// ─────────────────────────────────────────────────────────────────────────

export interface StructuredRelationEvent {
  type:
    | "decision.caused_outcome"
    | "risk.blocked_project"
    | "finding.informs_decision"
    | "playbook.supersedes_playbook"
    | "owner.assigned";
  payload: {
    fromKey: string;
    toKey: string;
    weight?: number;
    metadata?: Record<string, unknown>;
  };
}

const EVENT_TYPE_TO_RELATION: Record<StructuredRelationEvent["type"], RelationType> = {
  "decision.caused_outcome": "caused",
  "risk.blocked_project": "blocked",
  "finding.informs_decision": "informs",
  "playbook.supersedes_playbook": "supersedes",
  "owner.assigned": "owns",
};

/**
 * Explicit, allow-listed mapping from a structured event to a graph
 * relation. Only event `type`s in EVENT_TYPE_TO_RELATION are ever turned
 * into edges — arbitrary/unstructured events never touch the graph.
 */
export function extractRelationFromEvent(event: StructuredRelationEvent): RelationInput | null {
  const relationType = EVENT_TYPE_TO_RELATION[event.type];
  if (!relationType) return null;
  return {
    fromKey: event.payload.fromKey,
    toKey: event.payload.toKey,
    type: relationType,
    weight: event.payload.weight,
    metadata: event.payload.metadata,
  };
}

/** Persist the raw event, then (if it's a recognized relation-bearing type) extract + upsert the edge. */
export async function recordStructuredEvent(event: StructuredRelationEvent) {
  const [eventRow] = await db
    .insert(events)
    .values({ type: event.type, payload: event.payload, subjectType: "relation", subjectId: event.payload.fromKey })
    .returning();
  const relationInput = extractRelationFromEvent(event);
  if (!relationInput) return { event: eventRow, relation: null };
  const relation = await upsertRelation({ ...relationInput, sourceEventId: eventRow.id });
  return { event: eventRow, relation };
}
