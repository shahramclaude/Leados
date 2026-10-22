// =============================================================================
// knowledgeGraph.ts — Temporal knowledge graph store + query engine
// =============================================================================
// Entities: people, teams, projects, decisions, hypotheses, risks, metrics,
// playbooks. Relations are typed, bitemporal edges with provenance.
//
// STORAGE CHOICE: recursive CTE over `relations` (justified in
// docs/PART-12-KNOWLEDGE-MEMORY.md). We additionally maintain a nightly
// materialized `relationClosure` accelerator table (see selfImprove.ts) for
// cheap blast-radius counts on dashboards, but it is NEVER the source of
// truth and is always rebuildable.
//
// LLM-extracted edges are proposals (`confidenceClass: "proposed"`,
// `extractedBy: "llm-proposal"`) until a human confirms them. Only
// `observed` and `confirmed` edges are treated as facts by default graph
// reads; callers must opt in with `includeProposed` to see proposals.
// =============================================================================

import { db } from "@/db";
import { entities, relations } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export type EntityType =
  | "person"
  | "team"
  | "project"
  | "decision"
  | "hypothesis"
  | "risk"
  | "metric"
  | "playbook";

export type RelationType =
  | "caused"
  | "blocked"
  | "informs"
  | "supersedes"
  | "owns"
  | "depends_on"
  | "evidences";

export type ConfidenceClass = "observed" | "proposed" | "confirmed" | "rejected";
export type ExtractedBy = "rule" | "llm-proposal" | "human";

export interface CreateEntityInput {
  type: EntityType;
  name: string;
  summary?: string;
  attributes?: Record<string, unknown>;
}

export interface CreateRelationInput {
  fromEntityId: string;
  toEntityId: string;
  relationType: RelationType;
  provenanceSource: string;
  confidenceClass?: ConfidenceClass;
  extractedBy?: ExtractedBy;
  confidence?: number;
  validFrom?: Date;
  notes?: string;
  /** If this edge supersedes a prior one, the prior edge's validTo is set. */
  supersedesRelationId?: string;
}

/**
 * Edge-type hallucination risk tiers. `caused` is the most hallucination
 * prone (causality is rarely directly observable) so it is FORCED into the
 * `proposed` confidence class whenever `extractedBy` is `llm-proposal`,
 * regardless of what the caller requests, and additionally requires a
 * `provenanceSource` that is not empty. See PHASE 5 attack-answer #1 in
 * docs/PART-12-KNOWLEDGE-MEMORY.md.
 */
const HIGH_RISK_RELATION_TYPES: ReadonlySet<RelationType> = new Set([
  "caused",
]);

export async function createEntity(input: CreateEntityInput) {
  const [row] = await db
    .insert(entities)
    .values({
      type: input.type,
      name: input.name,
      summary: input.summary ?? null,
      attributes: input.attributes ?? {},
    })
    .returning();
  return row;
}

export async function listEntities(filter?: { type?: EntityType; q?: string }) {
  const clauses = [];
  if (filter?.type) clauses.push(eq(entities.type, filter.type));
  if (filter?.q) {
    clauses.push(sql`${entities.name} ilike ${"%" + filter.q + "%"}`);
  }
  return db
    .select()
    .from(entities)
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(sql`${entities.authorityScore} desc`);
}

export async function getEntity(id: string) {
  const [row] = await db.select().from(entities).where(eq(entities.id, id));
  return row ?? null;
}

/**
 * Create a relation (edge). If `extractedBy === "llm-proposal"`, the edge is
 * always stored with `confidenceClass: "proposed"` no matter what the
 * caller passed — proposals must be confirmed by a human before they are
 * treated as facts by default graph reads.
 */
export async function createRelation(input: CreateRelationInput) {
  if (!input.provenanceSource || !input.provenanceSource.trim()) {
    throw new Error("provenanceSource is required for every relation");
  }

  const extractedBy = input.extractedBy ?? "rule";
  let confidenceClass = input.confidenceClass ?? "observed";

  if (extractedBy === "llm-proposal") {
    confidenceClass = "proposed";
  }
  if (extractedBy === "human") {
    confidenceClass = "confirmed";
  }

  // caused edges from LLM proposals get an additional confidence ceiling —
  // they cannot be auto-elevated above 0.6 without human confirmation.
  let confidence = input.confidence ?? 0.5;
  if (HIGH_RISK_RELATION_TYPES.has(input.relationType) && extractedBy === "llm-proposal") {
    confidence = Math.min(confidence, 0.6);
  }

  if (input.supersedesRelationId) {
    await db
      .update(relations)
      .set({ validTo: input.validFrom ?? new Date() })
      .where(eq(relations.id, input.supersedesRelationId));
  }

  const [row] = await db
    .insert(relations)
    .values({
      fromEntityId: input.fromEntityId,
      toEntityId: input.toEntityId,
      relationType: input.relationType,
      provenanceSource: input.provenanceSource,
      confidenceClass,
      extractedBy,
      confidence: confidence.toString(),
      validFrom: input.validFrom ?? new Date(),
      supersedesRelationId: input.supersedesRelationId ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return row;
}

export async function confirmRelation(id: string, confirmedBy: string, accept: boolean) {
  const [row] = await db
    .update(relations)
    .set({
      confidenceClass: accept ? "confirmed" : "rejected",
      confirmedAt: new Date(),
      confirmedBy,
      confidence: accept ? "0.95" : "0.05",
    })
    .where(eq(relations.id, id))
    .returning();
  return row;
}

export interface GraphQueryOptions {
  includeProposed?: boolean;
  asOf?: Date;
  relationTypes?: RelationType[];
}

function factFilterSql(opts?: GraphQueryOptions) {
  const asOf = opts?.asOf ?? new Date();
  const confClause = opts?.includeProposed
    ? sql`r.confidence_class in ('observed','proposed','confirmed')`
    : sql`r.confidence_class in ('observed','confirmed')`;
  const typeClause = opts?.relationTypes?.length
    ? sql`and r.relation_type = any(${opts.relationTypes})`
    : sql``;
  return sql`${confClause} and r.valid_from <= ${asOf} and (r.valid_to is null or r.valid_to > ${asOf}) ${typeClause}`;
}

/**
 * Typed neighbor expansion to depth N via recursive CTE.
 * Direction: "out" follows fromEntityId -> toEntityId, "in" the reverse,
 * "both" expands in either direction.
 */
export async function neighborExpansion(
  entityId: string,
  depth: number,
  direction: "out" | "in" | "both" = "out",
  opts?: GraphQueryOptions,
) {
  const factFilter = factFilterSql(opts);
  const maxDepth = Math.max(1, Math.min(depth, 10));

  const joinCondOut = sql`r.from_entity_id = w.node_id`;
  const joinCondIn = sql`r.to_entity_id = w.node_id`;
  const nextNodeOut = sql`r.to_entity_id`;
  const nextNodeIn = sql`r.from_entity_id`;

  const joinCond =
    direction === "out" ? joinCondOut : direction === "in" ? joinCondIn : sql`(${joinCondOut} or ${joinCondIn})`;
  const nextNode =
    direction === "out"
      ? nextNodeOut
      : direction === "in"
        ? nextNodeIn
        : sql`case when ${joinCondOut} then ${nextNodeOut} else ${nextNodeIn} end`;

  const query = sql`
    with recursive walk as (
      select ${entityId}::text as node_id, 0 as depth,
             array[${entityId}::text] as path,
             array[]::text[] as relation_path
      union all
      select ${nextNode} as node_id, w.depth + 1,
             w.path || ${nextNode},
             w.relation_path || r.relation_type::text
      from relations r
      join walk w on ${joinCond}
      where w.depth < ${maxDepth}
        and ${factFilter}
        and not (${nextNode} = any(w.path))
    )
    select w.node_id, w.depth, w.path, w.relation_path,
           e.type, e.name, e.summary, e.authority_score
    from walk w
    join entities e on e.id = w.node_id
    where w.depth > 0
    order by w.depth asc, e.authority_score desc;
  `;

  const result = await db.execute(query);
  return result.rows as Array<{
    node_id: string;
    depth: number;
    path: string[];
    relation_path: string[];
    type: EntityType;
    name: string;
    summary: string | null;
    authority_score: string;
  }>;
}

/**
 * Shortest "influence path" between two entities (unweighted BFS via
 * recursive CTE, direction "out" = following causal/informational flow).
 */
export async function shortestInfluencePath(
  fromEntityId: string,
  toEntityId: string,
  opts?: GraphQueryOptions & { maxDepth?: number },
) {
  const factFilter = factFilterSql(opts);
  const maxDepth = opts?.maxDepth ?? 8;

  const query = sql`
    with recursive walk as (
      select r.from_entity_id as node_id, 1 as depth,
             array[r.from_entity_id, r.to_entity_id] as path,
             array[r.relation_type::text] as relation_path
      from relations r
      where r.from_entity_id = ${fromEntityId} and ${factFilter}
      union all
      select w.node_id, w.depth + 1,
             w.path || r.to_entity_id,
             w.relation_path || r.relation_type::text
      from relations r
      join walk w on r.from_entity_id = w.path[array_length(w.path, 1)]
      where w.depth < ${maxDepth}
        and ${factFilter}
        and not (r.to_entity_id = any(w.path))
    )
    select path, relation_path, depth
    from walk
    where path[array_length(path, 1)] = ${toEntityId}
    order by depth asc
    limit 1;
  `;

  const result = await db.execute(query);
  const row = result.rows[0] as
    | { path: string[]; relation_path: string[]; depth: number }
    | undefined;
  if (!row) return null;

  const nodeRows = await db
    .select({ id: entities.id, name: entities.name, type: entities.type })
    .from(entities)
    .where(sql`${entities.id} = any(${row.path})`);
  const byId = new Map(nodeRows.map((n) => [n.id, n]));

  return {
    depth: row.depth,
    path: row.path.map((id) => byId.get(id) ?? { id, name: "(unknown)", type: null }),
    relationPath: row.relation_path,
  };
}

/**
 * Blast radius: every entity reachable within `depth` hops downstream of
 * `entityId` following caused/blocked/depends_on edges (the "if this
 * changes, what else is affected" question).
 */
export async function blastRadius(entityId: string, depth = 3, opts?: GraphQueryOptions) {
  const impactTypes: RelationType[] = opts?.relationTypes ?? [
    "caused",
    "blocked",
    "depends_on",
    "informs",
  ];
  const expansion = await neighborExpansion(entityId, depth, "out", {
    ...opts,
    relationTypes: impactTypes,
  });
  const uniqueNodes = new Map<string, (typeof expansion)[number]>();
  for (const row of expansion) {
    if (!uniqueNodes.has(row.node_id) || uniqueNodes.get(row.node_id)!.depth > row.depth) {
      uniqueNodes.set(row.node_id, row);
    }
  }
  return {
    entityId,
    depth,
    count: uniqueNodes.size,
    nodes: [...uniqueNodes.values()],
  };
}

/**
 * Cycle detection over the current fact graph (confirmed/observed edges).
 * Returns every simple cycle found up to length `maxLen`, via recursive CTE.
 * Cycles are a data-quality smell for most of our relation types (e.g. two
 * decisions cannot legitimately "cause" each other) and are surfaced for
 * human review rather than silently resolved.
 */
export async function detectCycles(maxLen = 6, opts?: GraphQueryOptions) {
  const factFilter = factFilterSql(opts);
  const query = sql`
    with recursive walk as (
      select r.from_entity_id as start_id, r.to_entity_id as node_id, 1 as depth,
             array[r.from_entity_id, r.to_entity_id] as path,
             array[r.relation_type::text] as relation_path
      from relations r
      where ${factFilter}
      union all
      select w.start_id, r.to_entity_id, w.depth + 1,
             w.path || r.to_entity_id,
             w.relation_path || r.relation_type::text
      from relations r
      join walk w on r.from_entity_id = w.node_id
      where w.depth < ${maxLen}
        and ${factFilter}
        and (
          r.to_entity_id = w.start_id
          or not (r.to_entity_id = any(w.path))
        )
    )
    select distinct path, relation_path, depth
    from walk
    where node_id = start_id and depth > 1
    order by depth asc;
  `;
  const result = await db.execute(query);
  return result.rows as Array<{ path: string[]; relation_path: string[]; depth: number }>;
}

/**
 * Orphans: entities with zero edges (in or out) among fact-class relations.
 */
export async function findOrphans(opts?: GraphQueryOptions) {
  const factFilter = factFilterSql(opts);
  const query = sql`
    select e.id, e.type, e.name, e.created_at
    from entities e
    where not exists (
      select 1 from relations r
      where (r.from_entity_id = e.id or r.to_entity_id = e.id) and ${factFilter}
    )
    order by e.created_at desc;
  `;
  const result = await db.execute(query);
  return result.rows as Array<{ id: string; type: EntityType; name: string; created_at: string }>;
}

export async function listRelationsForEntity(entityId: string, opts?: GraphQueryOptions) {
  return db
    .select()
    .from(relations)
    .where(
      and(
        sql`(${relations.fromEntityId} = ${entityId} or ${relations.toEntityId} = ${entityId})`,
        opts?.includeProposed ? undefined : eq(relations.confidenceClass, "confirmed"),
      ),
    );
}

export async function listPendingProposals() {
  return db
    .select({
      relation: relations,
      fromName: sql<string>`fe.name`,
      toName: sql<string>`te.name`,
    })
    .from(relations)
    .innerJoin(sql`entities fe`, sql`fe.id = ${relations.fromEntityId}`)
    .innerJoin(sql`entities te`, sql`te.id = ${relations.toEntityId}`)
    .where(eq(relations.confidenceClass, "proposed"))
    .orderBy(sql`${relations.recordedAt} desc`);
}

export async function currentEdgesCount() {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(relations)
    .where(isNull(relations.validTo));
  return row?.count ?? 0;
}
