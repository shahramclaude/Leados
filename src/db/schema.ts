// =============================================================================
// LEADOS — Part 12: Knowledge Graph, Institutional Memory & Playbooks
// =============================================================================
// This schema implements:
//  - A temporal knowledge graph (entities + typed, bitemporal relations)
//  - A decaying institutional memory store (exponential retention model)
//  - Decision retrospectives (situation -> decision -> outcome -> lesson)
//  - Versioned, executable playbooks with run/outcome tracking
//  - Evidence links (entities <-> memories/docs) used for retrieval scoring
//  - Living documents, saved searches, and audited consolidation runs
//
// Design notes (see docs/PART-12-KNOWLEDGE-MEMORY.md for full justification):
//  - UUIDs are generated in the application layer via crypto.randomUUID()
//    (not Postgres gen_random_uuid()) to avoid requiring the pgcrypto
//    extension in a fresh database.
//  - Relations are bitemporal: `validFrom`/`validTo` track when a fact was
//    true in the world; `recordedAt` tracks when LEADOS learned it
//    (transaction time). Superseded relations are never deleted — they get
//    `validTo` set and a pointer from the superseding edge.
//  - Graph traversal is served primarily by recursive CTEs over `relations`
//    (always fresh, no write-time maintenance). `relationClosure` is a
//    nightly-materialized accelerator table used for dashboard-scale blast
//    radius counts. Both are benchmarked in PART-12-KNOWLEDGE-MEMORY.md.
// =============================================================================

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const uuidPk = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

export const entityTypeEnum = pgEnum("entity_type", [
  "person",
  "team",
  "project",
  "decision",
  "hypothesis",
  "risk",
  "metric",
  "playbook",
]);

export const relationTypeEnum = pgEnum("relation_type", [
  "caused",
  "blocked",
  "informs",
  "supersedes",
  "owns",
  "depends_on",
  "evidences",
]);

export const confidenceClassEnum = pgEnum("confidence_class", [
  "observed", // system-recorded fact (e.g. emitted by Part 10 automation)
  "proposed", // LLM-extracted candidate edge, pending human confirmation
  "confirmed", // human has reviewed and confirmed a proposed edge
  "rejected", // human has reviewed and rejected a proposed edge
]);

export const extractedByEnum = pgEnum("extracted_by", [
  "rule",
  "llm-proposal",
  "human",
]);

export const memoryClassEnum = pgEnum("memory_class", [
  "decision",
  "status",
  "risk",
  "metric",
  "lesson",
]);

export const playbookStatusEnum = pgEnum("playbook_status", [
  "draft",
  "active",
  "deprecated",
]);

export const runOutcomeEnum = pgEnum("run_outcome", [
  "in_progress",
  "success",
  "partial",
  "failure",
]);

export const retroStatusEnum = pgEnum("retro_status", [
  "pending",
  "completed",
  "skipped",
]);

export const evidenceTypeEnum = pgEnum("evidence_type", ["memory", "doc"]);

// -----------------------------------------------------------------------------
// Knowledge graph: entities + bitemporal relations
// -----------------------------------------------------------------------------

export const entities = pgTable(
  "entities",
  {
    id: uuidPk(),
    type: entityTypeEnum("type").notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    attributes: jsonb("attributes").notNull().default({}),
    // Authority score in [0, 1], computed by genome.ts from in-degree of
    // owns/informs edges, evidence volume, and confirmation ratio.
    authorityScore: numeric("authority_score", { precision: 6, scale: 4 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_entities_type").on(t.type),
    index("idx_entities_authority").on(t.authorityScore),
  ],
);

export const relations = pgTable(
  "relations",
  {
    id: uuidPk(),
    fromEntityId: text("from_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    toEntityId: text("to_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    relationType: relationTypeEnum("relation_type").notNull(),

    // Valid time (bitemporal: when was this true in the world)
    validFrom: timestamp("valid_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    validTo: timestamp("valid_to", { withTimezone: true }),

    // Transaction time (when LEADOS recorded it) — immutable
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Self-reference: if this edge supersedes an earlier one
    supersedesRelationId: text("supersedes_relation_id"),

    // Provenance — required for honesty/attribution rules
    provenanceSource: text("provenance_source").notNull(),
    confidenceClass: confidenceClassEnum("confidence_class")
      .notNull()
      .default("proposed"),
    extractedBy: extractedByEnum("extracted_by").notNull().default("rule"),
    confidence: numeric("confidence", { precision: 5, scale: 4 })
      .notNull()
      .default("0.5"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: text("confirmed_by"),
    notes: text("notes"),
  },
  (t) => [
    index("idx_relations_from").on(t.fromEntityId),
    index("idx_relations_to").on(t.toEntityId),
    index("idx_relations_type").on(t.relationType),
    index("idx_relations_from_to").on(t.fromEntityId, t.toEntityId),
    // Partial index used by "current state" graph queries (validTo IS NULL)
    index("idx_relations_current")
      .on(t.fromEntityId, t.toEntityId)
      .where(sql`valid_to is null`),
  ],
);

// Nightly-materialized transitive closure accelerator (see selfImprove.ts).
// Not the source of truth — always rebuildable from `relations`.
export const relationClosure = pgTable(
  "relation_closure",
  {
    id: uuidPk(),
    ancestorId: text("ancestor_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    descendantId: text("descendant_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    minDepth: integer("min_depth").notNull(),
    relationTypes: jsonb("relation_types").notNull().default([]),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_closure_pair").on(t.ancestorId, t.descendantId),
    index("idx_closure_ancestor").on(t.ancestorId),
    index("idx_closure_descendant").on(t.descendantId),
  ],
);

// -----------------------------------------------------------------------------
// Institutional memory: decaying records, never deleted
// -----------------------------------------------------------------------------

export const memories = pgTable(
  "memories",
  {
    id: uuidPk(),
    class: memoryClassEnum("class").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    entityId: text("entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),
    relatedEntityIds: jsonb("related_entity_ids").notNull().default([]),
    // Strength S (days) of the exponential retention model R(t) = e^(-t/S)
    strength: numeric("strength", { precision: 10, scale: 4 }).notNull(),
    lastReactivatedAt: timestamp("last_reactivated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reactivationCount: integer("reactivation_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    provenanceSource: text("provenance_source").notNull(),
    sourceType: text("source_type").notNull(),
    // Memories are never deleted. `archived` just hides stale ones from
    // default views; they remain fully queryable and still decay/age.
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [
    index("idx_memories_class").on(t.class),
    index("idx_memories_entity").on(t.entityId),
    index("idx_memories_reactivated").on(t.lastReactivatedAt),
  ],
);

// -----------------------------------------------------------------------------
// Decision retrospectives
// -----------------------------------------------------------------------------

export const retrospectives = pgTable(
  "retrospectives",
  {
    id: uuidPk(),
    decisionEntityId: text("decision_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    situation: text("situation").notNull(),
    decision: text("decision").notNull(),
    expectation: text("expectation").notNull(),
    outcome: text("outcome"),
    lesson: text("lesson"),
    outcomeVsExpectation: text("outcome_vs_expectation"),
    playbookImpactId: text("playbook_impact_id"),
    reviewAt: timestamp("review_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: retroStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_retro_status").on(t.status),
    index("idx_retro_review_at").on(t.reviewAt),
    index("idx_retro_decision").on(t.decisionEntityId),
  ],
);

// -----------------------------------------------------------------------------
// Playbooks: versioned, executable checklists
// -----------------------------------------------------------------------------

export const playbooks = pgTable(
  "playbooks",
  {
    id: uuidPk(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    trigger: jsonb("trigger").notNull(),
    // steps: Array<{ order, text, owner, verification }>
    steps: jsonb("steps").notNull(),
    status: playbookStatusEnum("status").notNull().default("draft"),
    createdFromRetrospectiveId: text("created_from_retrospective_id"),
    parentPlaybookId: text("parent_playbook_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_playbooks_slug").on(t.slug),
    index("idx_playbooks_status").on(t.status),
  ],
);

export const playbookRuns = pgTable(
  "playbook_runs",
  {
    id: uuidPk(),
    playbookId: text("playbook_id")
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    triggeredBy: text("triggered_by").notNull(),
    linkedDecisionEntityId: text("linked_decision_entity_id").references(
      () => entities.id,
      { onDelete: "set null" },
    ),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    outcome: runOutcomeEnum("outcome").notNull().default("in_progress"),
    notes: text("notes"),
    stepResults: jsonb("step_results").notNull().default([]),
  },
  (t) => [
    index("idx_runs_playbook").on(t.playbookId),
    index("idx_runs_outcome").on(t.outcome),
  ],
);

// -----------------------------------------------------------------------------
// Living docs, evidence links, saved searches, consolidation audit log
// -----------------------------------------------------------------------------

export const docs = pgTable(
  "docs",
  {
    id: uuidPk(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    sourceEntityIds: jsonb("source_entity_ids").notNull().default([]),
    version: integer("version").notNull().default(1),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_docs_last_synced").on(t.lastSyncedAt)],
);

export const evidenceLinks = pgTable(
  "evidence_links",
  {
    id: uuidPk(),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    evidenceType: evidenceTypeEnum("evidence_type").notNull(),
    evidenceId: text("evidence_id").notNull(),
    strength: numeric("strength", { precision: 5, scale: 4 })
      .notNull()
      .default("0.5"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_evidence_entity").on(t.entityId),
    index("idx_evidence_lookup").on(t.evidenceType, t.evidenceId),
  ],
);

export const savedSearches = pgTable("saved_searches", {
  id: uuidPk(),
  name: text("name").notNull(),
  queryText: text("query_text").notNull(),
  filters: jsonb("filters").notNull().default({}),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const consolidationRuns = pgTable("consolidation_runs", {
  id: uuidPk(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  decayedCount: integer("decayed_count").notNull().default(0),
  strengthenedCount: integer("strengthened_count").notNull().default(0),
  orphansFlagged: integer("orphans_flagged").notNull().default(0),
  closureEdgesRebuilt: integer("closure_edges_rebuilt").notNull().default(0),
  status: text("status").notNull().default("running"),
  log: jsonb("log").notNull().default([]),
});
