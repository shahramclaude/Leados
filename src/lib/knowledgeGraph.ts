// src/lib/knowledgeGraph.ts
//
// Knowledge graph as a first-class store (mission §A). Entities (people,
// teams, projects, decisions, hypotheses, metrics, risks, playbooks,
// skills) + typed, directed relations (`caused`, `blocked`, `informs`,
// `supersedes`, `owns`, `depends_on`, `evidences`).
//
// OBSERVED vs PROPOSED edges:
//   - `createRelation(...)` writes an OBSERVED fact. Call sites are
//     deterministic rules over structured events (see
//     `extractRelationsFromEvent` below) — e.g. a `blocker_raised` event on
//     a project deterministically creates a `blocked` edge. These are
//     treated as ground truth.
//   - `proposeRelation(...)` writes a PROPOSED edge with mandatory
//     `confidence` (0..1) and `provenance` (who/what proposed it — a rule
//     name or, per Part 08's LLM layer, a model+prompt id). Proposed edges
//     are invisible to blast-radius/shortest-path/cycle-detection by
//     default (`includeProposed: false`) until `confirmRelation(...)`
//     promotes them to observed. This is the mechanism mission §A and the
//     adversarial self-review require: inferred relations are never
//     presented as observed facts.
//
// INDEXING / QUERY-PLAN CHOICE (mission §A: "Index for these queries
// (recursive CTE or closure table — choose, justify, explain the plans)."):
//
//   Chosen: recursive CTE over a plain edge table with btree indexes on
//   (from_entity_id), (to_entity_id), (type) — NOT a closure table.
//
//   Justification: LEADOS's relation graph is write-light (edges are
//   created by deterministic rules on event ingestion, or rarely, by
//   human-confirmed proposals — not a high-frequency OLTP workload) and
//   read-moderate (graph panel loads, retrieval expansion, nightly
//   consolidation). A transitive-closure table trades write complexity
//   (every insert/delete must maintain O(depth) derived rows, and cycles
//   make closure-table maintenance genuinely hard to get right) for read
//   speed we do not need yet: a recursive CTE bounded to depth <= 6 over a
//   few thousand edges returns in low single-digit milliseconds (see
//   `docs/knowledge-graph-query-plans.md` for captured `EXPLAIN ANALYZE`
//   output from `scripts/verify.ts`). If the edge count grows by 2-3 orders
//   of magnitude, or blast-radius queries become a hot path, the documented
//   fallback is to add a closure table maintained by a trigger — not
//   something to build speculatively today.
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { entities, events, relations } from "@/db/schema";
import { jaccard } from "@/lib/memory";

export { jaccard };

export const RELATION_TYPES = [
  "caused",
  "blocked",
  "informs",
  "supersedes",
  "owns",
  "depends_on",
  "evidences",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];
export const ENTITY_TYPES = [
  "person",
  "team",
  "project",
  "decision",
  "hypothesis",
  "metric",
  "risk",
  "playbook",
  "skill",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/* -------------------------------------------------------------------------- */
/* Entity CRUD                                                                 */
/* -------------------------------------------------------------------------- */

export async function upsertEntity(input: { key: string; type: EntityType | string; name: string; attributes?: Record<string, unknown> }) {
  const existing = await getEntityByKey(input.key);
  if (existing) {
    const [row] = await db
      .update(entities)
      .set({ name: input.name, attributes: input.attributes ?? existing.attributes, updatedAt: new Date() })
      .where(eq(entities.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(entities)
    .values({ key: input.key, type: input.type, name: input.name, attributes: input.attributes ?? {} })
    .returning();
  return row;
}

export async function getEntityByKey(key: string) {
  const [row] = await db.select().from(entities).where(eq(entities.key, key)).limit(1);
  return row ?? null;
}

export async function getEntityByName(name: string) {
  const [row] = await db.select().from(entities).where(eq(entities.name, name)).limit(1);
  return row ?? null;
}

export async function listEntities(type?: string) {
  return type
    ? db.select().from(entities).where(eq(entities.type, type)).orderBy(desc(entities.importance))
    : db.select().from(entities).orderBy(desc(entities.importance));
}

/* -------------------------------------------------------------------------- */
/* Relation creation                                                           */
/* -------------------------------------------------------------------------- */

export async function createRelation(input: {
  fromKey: string;
  toKey: string;
  type: RelationType | string;
  weight?: number;
  provenance?: Record<string, unknown>;
}) {
  const [from, to] = await Promise.all([getEntityByKey(input.fromKey), getEntityByKey(input.toKey)]);
  if (!from) throw new Error(`Unknown entity key "${input.fromKey}"`);
  if (!to) throw new Error(`Unknown entity key "${input.toKey}"`);
  const [row] = await db
    .insert(relations)
    .values({
      fromEntityId: from.id,
      toEntityId: to.id,
      type: input.type,
      status: "observed",
      weight: (input.weight ?? 1).toFixed(3),
      provenance: input.provenance ?? { source: "rule" },
    })
    .returning();
  return row;
}

/** Keep the plain `linkEntities(fromId,toId,relation)` helper for retrieval callers that already resolved uuids. */
export async function linkEntities(fromEntityId: string, toEntityId: string, relation: string, weight = 1) {
  const [row] = await db
    .insert(relations)
    .values({ fromEntityId, toEntityId, type: relation, status: "observed", weight: weight.toFixed(3) })
    .returning();
  return row;
}

/** Inferred edges require confidence + provenance and start out invisible to graph analytics until confirmed (adversarial review §1). */
export async function proposeRelation(input: {
  fromKey: string;
  toKey: string;
  type: RelationType | string;
  confidence: number;
  provenance: Record<string, unknown>;
}) {
  if (input.confidence < 0 || input.confidence > 1) throw new Error("confidence must be in [0,1]");
  if (!input.provenance || Object.keys(input.provenance).length === 0) {
    throw new Error("Proposed relations require non-empty provenance (who/what proposed this edge).");
  }
  const [from, to] = await Promise.all([getEntityByKey(input.fromKey), getEntityByKey(input.toKey)]);
  if (!from) throw new Error(`Unknown entity key "${input.fromKey}"`);
  if (!to) throw new Error(`Unknown entity key "${input.toKey}"`);
  const [row] = await db
    .insert(relations)
    .values({
      fromEntityId: from.id,
      toEntityId: to.id,
      type: input.type,
      status: "proposed",
      confidence: input.confidence.toFixed(4),
      provenance: input.provenance,
      weight: "1",
    })
    .returning();
  return row;
}

export async function confirmRelation(relationId: string, confirmedBy: string) {
  const [row] = await db
    .update(relations)
    .set({ status: "observed", confirmedAt: new Date(), confirmedBy })
    .where(eq(relations.id, relationId))
    .returning();
  return row;
}

export async function rejectRelation(relationId: string) {
  await db.delete(relations).where(and(eq(relations.id, relationId), eq(relations.status, "proposed")));
}

export async function listPendingProposals() {
  return db.select().from(relations).where(eq(relations.status, "proposed")).orderBy(desc(relations.createdAt));
}

/**
 * Deterministic rule-based extraction: structured events -> OBSERVED edges.
 * This is the "extracted from structured events (deterministic rules)" half
 * of mission §A. Each rule is named so provenance is auditable.
 */
export async function extractRelationsFromEvent(eventId: string) {
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event || !event.entityId) return [];
  const created: (typeof relations.$inferSelect)[] = [];

  if (event.type === "blocker_raised" && typeof event.payload === "object" && event.payload) {
    const blockerKey = (event.payload as Record<string, unknown>).blockedByKey as string | undefined;
    if (blockerKey) {
      const blocker = await getEntityByKey(blockerKey);
      const target = await db.select().from(entities).where(eq(entities.id, event.entityId)).limit(1);
      if (blocker && target[0]) {
        const [row] = await db
          .insert(relations)
          .values({
            fromEntityId: blocker.id,
            toEntityId: target[0].id,
            type: "blocked",
            status: "observed",
            provenance: { source: "rule:blocker_raised", eventId },
          })
          .returning();
        created.push(row);
      }
    }
  }

  if (event.type === "decision" && typeof event.payload === "object" && event.payload) {
    const supersedesKey = (event.payload as Record<string, unknown>).supersedesKey as string | undefined;
    if (supersedesKey) {
      const prior = await getEntityByKey(supersedesKey);
      const target = await db.select().from(entities).where(eq(entities.id, event.entityId)).limit(1);
      if (prior && target[0]) {
        const [row] = await db
          .insert(relations)
          .values({
            fromEntityId: target[0].id,
            toEntityId: prior.id,
            type: "supersedes",
            status: "observed",
            provenance: { source: "rule:decision_supersedes", eventId },
          })
          .returning();
        created.push(row);
      }
    }
  }

  return created;
}

/* -------------------------------------------------------------------------- */
/* 1-hop expansion (used by retrieval/index.ts)                               */
/* -------------------------------------------------------------------------- */

export type GraphNeighbor = { entityId: string; name: string; relation: string; weight: number; hops: 1 };

export async function expandNeighborhood(seedEntityIds: string[]): Promise<GraphNeighbor[]> {
  if (seedEntityIds.length === 0) return [];
  const edges = await db
    .select()
    .from(relations)
    .where(
      and(
        eq(relations.status, "observed"),
        or(inArray(relations.fromEntityId, seedEntityIds), inArray(relations.toEntityId, seedEntityIds))
      )
    );

  const neighborIds = new Set<string>();
  for (const e of edges) {
    if (seedEntityIds.includes(e.fromEntityId) && !seedEntityIds.includes(e.toEntityId)) neighborIds.add(e.toEntityId);
    if (seedEntityIds.includes(e.toEntityId) && !seedEntityIds.includes(e.fromEntityId)) neighborIds.add(e.fromEntityId);
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
    results.push({ entityId: neighborId, name, relation: e.type, weight: Number(e.weight), hops: 1 });
  }
  return results;
}

/* -------------------------------------------------------------------------- */
/* Graph query: neighbors at depth N, edge-typed                              */
/* -------------------------------------------------------------------------- */

export type NeighborEntry = { key: string; name: string; type: string; relation: string; depth: number; direction: "out" | "in" };

/**
 * Neighbors within `depth` hops (either direction), optionally filtered to
 * a set of edge types. Implemented as a bounded recursive CTE — see the
 * module-level comment for the closure-table-vs-CTE justification.
 */
export async function getNeighbors(
  key: string,
  depth = 2,
  edgeTypes?: string[]
): Promise<{ root: string; neighbors: NeighborEntry[] }> {
  const root = await getEntityByKey(key);
  if (!root) return { root: key, neighbors: [] };
  const boundedDepth = Math.max(1, Math.min(6, depth));
  const typeFilter = edgeTypes && edgeTypes.length > 0 ? sql`and r.type = any(${edgeTypes})` : sql``;

  const result = await db.execute(sql`
    with recursive walk(entity_id, direction, relation, depth, path) as (
      select r.to_entity_id, 'out'::text, r.type, 1, array[r.from_entity_id, r.to_entity_id]
      from relations r
      where r.from_entity_id = ${root.id} and r.status = 'observed' ${typeFilter}
      union all
      select r.from_entity_id, 'in'::text, r.type, 1, array[r.to_entity_id, r.from_entity_id]
      from relations r
      where r.to_entity_id = ${root.id} and r.status = 'observed' ${typeFilter}
      union all
      select r.to_entity_id, 'out'::text, r.type, w.depth + 1, w.path || r.to_entity_id
      from relations r
      join walk w on r.from_entity_id = w.entity_id
      where w.depth < ${boundedDepth} and r.status = 'observed' and not (r.to_entity_id = any(w.path)) ${typeFilter}
      union all
      select r.from_entity_id, 'in'::text, r.type, w.depth + 1, w.path || r.from_entity_id
      from relations r
      join walk w on r.to_entity_id = w.entity_id
      where w.depth < ${boundedDepth} and r.status = 'observed' and not (r.from_entity_id = any(w.path)) ${typeFilter}
    )
    select distinct on (entity_id) entity_id as "entityId", direction, relation, depth
    from walk
    order by entity_id, depth asc
  `);

  type Row = { entityId: string; direction: "out" | "in"; relation: string; depth: number };
  const rows = result.rows as unknown as Row[];
  if (rows.length === 0) return { root: key, neighbors: [] };

  const entityRows = await db.select().from(entities).where(inArray(entities.id, rows.map((r) => r.entityId)));
  const byId = new Map(entityRows.map((e) => [e.id, e]));

  const neighbors: NeighborEntry[] = rows
    .map((r) => {
      const e = byId.get(r.entityId);
      if (!e) return null;
      return { key: e.key, name: e.name, type: e.type, relation: r.relation, depth: r.depth, direction: r.direction };
    })
    .filter((v): v is NeighborEntry => v !== null)
    .sort((a, b) => a.depth - b.depth);

  return { root: key, neighbors };
}

/* -------------------------------------------------------------------------- */
/* Graph query: shortest influence path between two entities                  */
/* -------------------------------------------------------------------------- */

export type PathStep = { fromKey: string; toKey: string; relation: string };

/** Unweighted shortest path (fewest hops) via BFS recursive CTE, directed. Returns null if unreachable within 8 hops. */
export async function getShortestPath(fromKey: string, toKey: string): Promise<{ hops: number; path: PathStep[] } | null> {
  const [from, to] = await Promise.all([getEntityByKey(fromKey), getEntityByKey(toKey)]);
  if (!from || !to) return null;
  if (from.id === to.id) return { hops: 0, path: [] };

  const result = await db.execute(sql`
    with recursive bfs(entity_id, depth, path, rels) as (
      select r.to_entity_id, 1, array[r.from_entity_id, r.to_entity_id], array[r.type]
      from relations r
      where r.from_entity_id = ${from.id} and r.status = 'observed'
      union all
      select r.to_entity_id, b.depth + 1, b.path || r.to_entity_id, b.rels || r.type
      from relations r
      join bfs b on r.from_entity_id = b.entity_id
      where b.depth < 8 and r.status = 'observed' and not (r.to_entity_id = any(b.path))
    )
    select path, rels, depth from bfs where entity_id = ${to.id} order by depth asc limit 1
  `);

  type Row = { path: string[]; rels: string[]; depth: number };
  const rows = result.rows as unknown as Row[];
  if (rows.length === 0) return null;
  const { path, rels } = rows[0];

  const entityRows = await db.select().from(entities).where(inArray(entities.id, path));
  const byId = new Map(entityRows.map((e) => [e.id, e.key]));
  const steps: PathStep[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    steps.push({ fromKey: byId.get(path[i]) ?? path[i], toKey: byId.get(path[i + 1]) ?? path[i + 1], relation: rels[i] });
  }
  return { hops: rows[0].depth, path: steps };
}

/* -------------------------------------------------------------------------- */
/* Graph query: blast radius of a change                                      */
/* -------------------------------------------------------------------------- */

export type BlastEntry = { key: string; name: string; type: string; relation: string; depth: number };

/**
 * Everything potentially affected if `key` changes: downstream reachability
 * along causally-directional edge types (`caused`, `blocked`, `depends_on`
 * followed in reverse — i.e. "what depends on me", `informs`, `supersedes`).
 * `evidences`/`owns` are excluded by default since they describe sourcing/
 * ownership, not propagation of change.
 */
const BLAST_RADIUS_TYPES = ["caused", "blocked", "informs", "supersedes"];

export async function getBlastRadius(key: string, depth = 3): Promise<BlastEntry[]> {
  const root = await getEntityByKey(key);
  if (!root) return [];
  const boundedDepth = Math.max(1, Math.min(6, depth));

  const result = await db.execute(sql`
    with recursive downstream(entity_id, relation, depth, path) as (
      select r.to_entity_id, r.type, 1, array[r.from_entity_id, r.to_entity_id]
      from relations r
      where r.from_entity_id = ${root.id} and r.status = 'observed' and r.type = any(${BLAST_RADIUS_TYPES})
      union all
      -- "depends_on" propagates backwards: if B depends_on A and A changes, B is affected.
      select r.from_entity_id, r.type, 1, array[r.to_entity_id, r.from_entity_id]
      from relations r
      where r.to_entity_id = ${root.id} and r.status = 'observed' and r.type = 'depends_on'
      union all
      select r.to_entity_id, r.type, d.depth + 1, d.path || r.to_entity_id
      from relations r
      join downstream d on r.from_entity_id = d.entity_id
      where d.depth < ${boundedDepth} and r.status = 'observed' and r.type = any(${BLAST_RADIUS_TYPES})
        and not (r.to_entity_id = any(d.path))
      union all
      select r.from_entity_id, r.type, d.depth + 1, d.path || r.from_entity_id
      from relations r
      join downstream d on r.to_entity_id = d.entity_id
      where d.depth < ${boundedDepth} and r.status = 'observed' and r.type = 'depends_on'
        and not (r.from_entity_id = any(d.path))
    )
    select distinct on (entity_id) entity_id as "entityId", relation, depth
    from downstream
    order by entity_id, depth asc
  `);

  type Row = { entityId: string; relation: string; depth: number };
  const rows = result.rows as unknown as Row[];
  if (rows.length === 0) return [];
  const entityRows = await db.select().from(entities).where(inArray(entities.id, rows.map((r) => r.entityId)));
  const byId = new Map(entityRows.map((e) => [e.id, e]));
  return rows
    .map((r) => {
      const e = byId.get(r.entityId);
      if (!e) return null;
      return { key: e.key, name: e.name, type: e.type, relation: r.relation, depth: r.depth };
    })
    .filter((v): v is BlastEntry => v !== null)
    .sort((a, b) => a.depth - b.depth);
}

/* -------------------------------------------------------------------------- */
/* Graph query: cycle detection                                               */
/* -------------------------------------------------------------------------- */

export type CycleReport = { entityKey: string; path: string[] };

/** Detects directed cycles reachable within 10 hops of any entity (observed edges only — proposed edges can't corrupt analytics). */
export async function detectCycles(): Promise<CycleReport[]> {
  const result = await db.execute(sql`
    with recursive walk(start_id, entity_id, depth, path) as (
      select r.from_entity_id, r.to_entity_id, 1, array[r.from_entity_id, r.to_entity_id]
      from relations r
      where r.status = 'observed'
      union all
      select w.start_id, r.to_entity_id, w.depth + 1, w.path || r.to_entity_id
      from relations r
      join walk w on r.from_entity_id = w.entity_id
      where w.depth < 10 and r.status = 'observed' and r.to_entity_id <> all(w.path[1:array_length(w.path,1)-1])
    )
    select start_id as "startId", path
    from walk
    where entity_id = start_id
  `);
  type Row = { startId: string; path: string[] };
  const rows = result.rows as unknown as Row[];
  if (rows.length === 0) return [];
  const allIds = Array.from(new Set(rows.flatMap((r) => r.path)));
  const entityRows = await db.select().from(entities).where(inArray(entities.id, allIds));
  const byId = new Map(entityRows.map((e) => [e.id, e.key]));
  const seen = new Set<string>();
  const cycles: CycleReport[] = [];
  for (const row of rows) {
    const pathKeys = row.path.map((id) => byId.get(id) ?? id);
    const signature = [...pathKeys].sort().join(">");
    if (seen.has(signature)) continue;
    seen.add(signature);
    cycles.push({ entityKey: byId.get(row.startId) ?? row.startId, path: pathKeys });
  }
  return cycles;
}

/* -------------------------------------------------------------------------- */
/* Graph query: orphan / neglected-entity detection                           */
/* -------------------------------------------------------------------------- */

export type OrphanEntry = { key: string; name: string; type: string; reason: "no_edges" | "neglected"; daysSinceActivity: number | null };

/** Entities with zero edges ("orphan"), or with edges but no event activity in `staleDays` ("neglected"). */
export async function getOrphans(staleDays = 90): Promise<OrphanEntry[]> {
  const allEntities = await db.select().from(entities);
  const allEdges = await db.select({ from: relations.fromEntityId, to: relations.toEntityId }).from(relations).where(eq(relations.status, "observed"));
  const connected = new Set<string>();
  for (const e of allEdges) {
    connected.add(e.from);
    connected.add(e.to);
  }
  const lastEventByEntity = await db.execute(sql`
    select entity_id as "entityId", max(occurred_at) as "lastAt" from events where entity_id is not null group by entity_id
  `);
  type Row = { entityId: string; lastAt: Date };
  const lastAtById = new Map((lastEventByEntity.rows as unknown as Row[]).map((r) => [r.entityId, new Date(r.lastAt)]));

  const out: OrphanEntry[] = [];
  const now = Date.now();
  for (const e of allEntities) {
    if (!connected.has(e.id)) {
      out.push({ key: e.key, name: e.name, type: e.type, reason: "no_edges", daysSinceActivity: null });
      continue;
    }
    const lastAt = lastAtById.get(e.id);
    const daysSince = lastAt ? (now - lastAt.getTime()) / (1000 * 60 * 60 * 24) : null;
    if (daysSince === null || daysSince > staleDays) {
      out.push({ key: e.key, name: e.name, type: e.type, reason: "neglected", daysSinceActivity: daysSince });
    }
  }
  return out;
}

/** Recompute entity "authority" (0..1) from in-degree + out-degree of observed edges — feeds retrieval ranking. Deterministic, idempotent. */
export async function recomputeEntityImportance(): Promise<number> {
  const allEntities = await db.select({ id: entities.id }).from(entities);
  const edgeCounts = await db.execute(sql`
    select coalesce(from_entity_id, to_entity_id) as id, count(*) as degree from (
      select from_entity_id, null::uuid as to_entity_id from relations where status = 'observed'
      union all
      select null::uuid, to_entity_id from relations where status = 'observed'
    ) x group by 1
  `);
  type Row = { id: string; degree: string };
  const degreeById = new Map((edgeCounts.rows as unknown as Row[]).map((r) => [r.id, Number(r.degree)]));
  const maxDegree = Math.max(1, ...Array.from(degreeById.values()));
  let updated = 0;
  for (const e of allEntities) {
    const degree = degreeById.get(e.id) ?? 0;
    const importance = clampImportance(0.1 + 0.9 * (degree / maxDegree));
    await db.update(entities).set({ importance: importance.toFixed(4), updatedAt: new Date() }).where(eq(entities.id, e.id));
    updated += 1;
  }
  return updated;
}

function clampImportance(v: number) {
  return Math.max(0, Math.min(1, v));
}
