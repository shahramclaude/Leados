// src/db/schema.ts
//
// LEADOS — Part 11: Knowledge systems (knowledge graph, institutional
// memory, hypotheses, playbooks, retrieval, living documents).
//
// REPO-STATE DISCLOSURE (standing order §1): the sandbox this part was
// built in started from the generic `nextjs-postgresql-template` — an
// empty `src/db/schema.ts`. Before writing anything, this session fetched
// the real https://github.com/shahramclaude/Leados checkout over the
// network (git clone + raw file fetch) and read the files the standing
// order names. What was actually found there (see AI-SESSION-LOG.md for
// the full list) was NOT one coherent Part 1-10 codebase: it is a
// patchwork of independently-written slices from different sessions that
// never compiled against each other —
//   - `src/lib/knowledgeGraph.ts` exported only `expandNeighborhood` /
//     `linkEntities` / `getEntityByName`, but `src/app/api/knowledge/graph/
//     route.ts` already called `getNeighbors` / `getShortestPath` /
//     `getBlastRadius` / `getOrphans`, which did not exist anywhere.
//   - `src/app/api/memory/route.ts` called `listTimeline` /
//     `recallOnThisDay` / `recordRetrospective` / ..., none of which
//     existed in the `institutionalMemory.ts` this session could fetch
//     (that file only had `createMemoryNote` / `listMemoryNotes`).
//   - `src/db/schema.ts` on `main` is entirely Part-10 (finance/OKR)
//     content and defines none of `entities`, `relations`, `retrospectives`,
//     `hypotheses`, `playbooks`, etc. that the knowledge-system lib files
//     require, even though those lib files import them from "@/db/schema".
//   - `src/app/api/hypothesis/route.ts` (singular) and `src/lib/
//     familiarity.ts` / `src/lib/selfImprove.ts` turned out to belong to
//     unrelated subsystems (a rule-calibration engine and a talent engine)
//     that happen to share file-stem names with this part's reading list —
//     they are left untouched; nothing in this delivery writes to them.
//
// Decision: this file keeps the real Part-10 tables (section "PART 10",
// copied verbatim from the upstream `main` branch so nothing already
// delivered is destroyed) and ADDS the Part 11 knowledge-system tables
// below as the single source of truth those lib files now actually use,
// reconciling the two incompatible lib/route contracts above in favour of
// whichever shape the already-shipped API route expected (routes are the
// more durable contract — swapping a lib's internals is cheaper than
// swapping a shipped HTTP contract).
import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ========================================================================== */
/* PART 10 (verbatim from upstream main — preserved, not owned by this part)  */
/* ========================================================================== */

export const assumptions = pgTable("assumptions", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  category: text("category").notNull(),
  owner: text("owner").notNull(),
  rationale: text("rationale").notNull(),
  unit: text("unit").notNull(),
  low: numeric("low", { precision: 14, scale: 4 }).notNull(),
  base: numeric("base", { precision: 14, scale: 4 }).notNull(),
  high: numeric("high", { precision: 14, scale: 4 }).notNull(),
  version: integer("version").notNull().default(1),
  effectiveDate: date("effective_date").notNull(),
  supersedesId: integer("supersedes_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  context: text("context").notNull(),
  status: text("status").notNull().default("open"),
  reversibility: text("reversibility").notNull(),
  ownerId: text("owner_id").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  reviewDate: date("review_date"),
  chosenOptionId: integer("chosen_option_id"),
  downsideAcknowledged: boolean("downside_acknowledged").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const decisionRetrospectivesLegacy = pgTable("decision_retrospectives", {
  id: serial("id").primaryKey(),
  decisionId: integer("decision_id").notNull(),
  dueAt: date("due_at").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  predicted: jsonb("predicted").notNull(),
  actual: jsonb("actual"),
  calibrationErrorNotes: text("calibration_error_notes").notNull().default(""),
  lessons: text("lessons").notNull().default(""),
});

export const jobRuns = pgTable("job_runs", {
  id: serial("id").primaryKey(),
  jobName: text("job_name").notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull(),
  detail: jsonb("detail").notNull().default({}),
});

/* ========================================================================== */
/* PART 11-A: Knowledge graph — entities + typed relations                    */
/* ========================================================================== */

/**
 * Every first-class organizational object: person, team, project, decision,
 * hypothesis, metric, risk, playbook, skill. `key` is the stable,
 * human-legible identifier used in URLs/queries (e.g. "project:apollo"),
 * `id` is the DB-internal uuid used for joins.
 */
export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    type: text("type").notNull(), // person | team | project | decision | hypothesis | metric | risk | playbook | skill
    name: text("name").notNull(),
    attributes: jsonb("attributes").notNull().default({}),
    // Authority score (0..1) feeding retrieval ranking — recomputed by
    // recomputeEntityImportance(), never hand-edited.
    importance: numeric("importance", { precision: 5, scale: 4 }).notNull().default("0.3"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("entities_key_idx").on(t.key), index("entities_type_idx").on(t.type)]
);

/**
 * Typed, directed graph edges. `status` distinguishes deterministically
 * OBSERVED facts (extracted by rule from structured events — see
 * knowledgeGraph.ts `extractRelationsFromEvent`) from model-PROPOSED
 * inferred edges awaiting human confirmation (`confidence` + `provenance`
 * required on every proposed row; see mission §A and adversarial review §1).
 *
 * Index strategy: plain btree on (from_entity_id), (to_entity_id) and
 * (type), used by the recursive-CTE graph queries in knowledgeGraph.ts. A
 * closure table was considered and rejected — see the comment block at the
 * top of knowledgeGraph.ts for the justification and the captured EXPLAIN
 * output in docs/knowledge-graph-query-plans.md.
 */
export const relations = pgTable(
  "relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromEntityId: uuid("from_entity_id").notNull(),
    toEntityId: uuid("to_entity_id").notNull(),
    type: text("type").notNull(), // caused | blocked | informs | supersedes | owns | depends_on | evidences
    status: text("status").notNull().default("observed"), // observed | proposed
    confidence: numeric("confidence", { precision: 5, scale: 4 }), // required when status = proposed
    provenance: jsonb("provenance").notNull().default({}), // { source: 'rule:<name>'|'llm:<model>', eventId?, note? }
    weight: numeric("weight", { precision: 6, scale: 3 }).notNull().default("1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: text("confirmed_by"),
  },
  (t) => [
    index("relations_from_idx").on(t.fromEntityId),
    index("relations_to_idx").on(t.toEntityId),
    index("relations_type_idx").on(t.type),
  ]
);

/** Deterministic organizational event log — the ground truth graph extraction and retrieval recency both read. */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id"),
    type: text("type").notNull(), // decision | status_change | risk_flagged | blocker_raised | blocker_resolved | metric_update | playbook_run | outcome
    summary: text("summary").notNull(),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_entity_idx").on(t.entityId), index("events_occurred_idx").on(t.occurredAt)]
);

export const metrics = pgTable(
  "metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id"),
    name: text("name").notNull(),
    value: numeric("value", { precision: 16, scale: 4 }).notNull(),
    unit: text("unit").notNull().default(""),
    asOf: timestamp("as_of", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("metrics_entity_idx").on(t.entityId), index("metrics_name_idx").on(t.name)]
);

/* ========================================================================== */
/* PART 11-B: Institutional memory (decaying retrospectives)                  */
/* ========================================================================== */

/**
 * Structured retrospective: situation -> decision -> outcome -> lesson ->
 * playbook impact. Created automatically from `decision_retrospectives`
 * (Part 10 seam, see `decisionRetrospectivesLegacy` above and
 * `institutionalMemory.ts#createFromDecisionRetrospective`) or manually via
 * the UI. NEVER deleted — `baseStrength`/`lastReinforcedAt` drive a decayed
 * display strength (see memory.ts) but the row itself is permanent.
 */
export const retrospectives = pgTable(
  "retrospectives",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    situation: text("situation").notNull(),
    decision: text("decision").notNull(),
    outcome: text("outcome").notNull(),
    outcomeValence: text("outcome_valence").notNull().default("neutral"), // positive | neutral | negative
    lesson: text("lesson").notNull(),
    playbookUpdate: text("playbook_update"), // non-null => this lesson implies a repeatable action (playbook mining input)
    tags: jsonb("tags").notNull().default([]),
    entityIds: jsonb("entity_ids").notNull().default([]),
    memoryClass: text("memory_class").notNull().default("decision"), // decision | incident | experiment | hiring | partnership
    occurredAt: date("occurred_at").notNull(),
    baseStrength: numeric("base_strength", { precision: 6, scale: 4 }).notNull().default("1"),
    lastReinforcedAt: timestamp("last_reinforced_at", { withTimezone: true }).notNull().defaultNow(),
    reactivationCount: integer("reactivation_count").notNull().default(0),
    sourceDecisionRetrospectiveId: integer("source_decision_retrospective_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("retrospectives_occurred_idx").on(t.occurredAt), index("retrospectives_class_idx").on(t.memoryClass)]
);

/** Every citation/reuse of a memory strengthens it — logged, never merged into the parent row, so reuse history is auditable. */
export const memoryReactivations = pgTable("memory_reactivations", {
  id: serial("id").primaryKey(),
  retrospectiveId: integer("retrospective_id").notNull(),
  reactivatedAt: timestamp("reactivated_at", { withTimezone: true }).notNull().defaultNow(),
  weight: numeric("weight", { precision: 5, scale: 3 }).notNull().default("1"),
  reason: text("reason"),
  citedBy: text("cited_by"),
});

/* ========================================================================== */
/* PART 11-C: Hypotheses as living bets                                       */
/* ========================================================================== */

export const hypotheses = pgTable(
  "hypotheses",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    ownerName: text("owner_name").notNull(),
    category: text("category"),
    priorProbability: numeric("prior_probability", { precision: 6, scale: 5 }).notNull(),
    currentProbability: numeric("current_probability", { precision: 6, scale: 5 }).notNull(),
    status: text("status").notNull().default("open"), // open | resolved_true | resolved_false | retired | disputed
    outcome: boolean("outcome"),
    resolutionDate: date("resolution_date"),
    resolutionMethod: text("resolution_method"), // auto | manual
    autoResolveRule: jsonb("auto_resolve_rule"), // { metricName, operator, threshold } objectively settles the bet
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("hypotheses_key_idx").on(t.key)]
);

export const hypothesisEvidence = pgTable("hypothesis_evidence", {
  id: serial("id").primaryKey(),
  hypothesisId: integer("hypothesis_id").notNull(),
  description: text("description").notNull(),
  direction: text("direction").notNull(), // supports | against
  likelihoodRatio: numeric("likelihood_ratio", { precision: 10, scale: 4 }).notNull(),
  probabilityBefore: numeric("probability_before", { precision: 6, scale: 5 }).notNull(),
  probabilityAfter: numeric("probability_after", { precision: 6, scale: 5 }).notNull(),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hypothesisDisputes = pgTable("hypothesis_disputes", {
  id: serial("id").primaryKey(),
  hypothesisId: integer("hypothesis_id").notNull(),
  raisedBy: text("raised_by").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"), // open | upheld | overturned
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

/* ========================================================================== */
/* PART 11-D: Playbooks                                                       */
/* ========================================================================== */

export const playbooks = pgTable(
  "playbooks",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    triggerConditions: jsonb("trigger_conditions").notNull().default([]),
    steps: jsonb("steps").notNull(), // PlaybookStep[] — order, title, description, owner, verification
    status: text("status").notNull().default("draft"), // draft | active | deprecated
    version: integer("version").notNull().default(1),
    changelog: jsonb("changelog").notNull().default([]),
    originRetrospectiveId: integer("origin_retrospective_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("playbooks_key_idx").on(t.key)]
);

/** Immutable version history for playbooks — every `updatePlaybook` call appends one row here in addition to bumping `playbooks.version`. */
export const playbookVersions = pgTable(
  "playbook_versions",
  {
    id: serial("id").primaryKey(),
    playbookId: integer("playbook_id").notNull(),
    version: integer("version").notNull(),
    steps: jsonb("steps").notNull(),
    changelogNote: text("changelog_note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("playbook_versions_playbook_idx").on(t.playbookId)]
);

export const playbookRuns = pgTable(
  "playbook_runs",
  {
    id: serial("id").primaryKey(),
    playbookId: integer("playbook_id").notNull(),
    playbookVersion: integer("playbook_version").notNull(),
    invokedBy: text("invoked_by").notNull(),
    invokedVia: text("invoked_via").notNull().default("human"), // human | automation
    context: jsonb("context").notNull().default({}),
    status: text("status").notNull().default("running"), // running | completed | failed
    stepResults: jsonb("step_results").notNull(),
    outcomeDelta: numeric("outcome_delta", { precision: 14, scale: 4 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("playbook_runs_playbook_idx").on(t.playbookId)]
);

export const playbookCandidates = pgTable("playbook_candidates", {
  id: serial("id").primaryKey(),
  sourceRetrospectiveId: integer("source_retrospective_id"),
  suggestedTitle: text("suggested_title").notNull(),
  suggestedSteps: jsonb("suggested_steps").notNull(),
  rationale: text("rationale").notNull(),
  status: text("status").notNull().default("suggested"), // suggested | accepted | rejected
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

/* ========================================================================== */
/* PART 11-E: Retrieval                                                       */
/* ========================================================================== */

export const savedSearches = pgTable("saved_searches", {
  id: serial("id").primaryKey(),
  ownerName: text("owner_name").notNull(),
  query: text("query").notNull(),
  filters: jsonb("filters").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ========================================================================== */
/* PART 11-F: Living documents                                                */
/* ========================================================================== */

export const docs = pgTable(
  "docs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id"),
    title: text("title").notNull(),
    body: text("body").notNull(), // current rendered body (= latest version's renderedBody)
    docType: text("doc_type").notNull().default("note"), // note | strategy | policy
    tags: jsonb("tags").notNull().default([]),
    isLiving: boolean("is_living").notNull().default(false),
    status: text("status").notNull().default("draft"), // draft | review | approved | superseded
    version: integer("version").notNull().default(1),
    supersedesId: uuid("supersedes_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("docs_entity_idx").on(t.entityId)]
);

export const docVersions = pgTable(
  "doc_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    docId: uuid("doc_id").notNull(),
    version: integer("version").notNull(),
    blocks: jsonb("blocks").notNull(), // DocBlock[] — prose | live(metric|finding|okr ref)
    renderedBody: text("rendered_body").notNull(),
    diffFromPrev: text("diff_from_prev"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("doc_versions_doc_idx").on(t.docId)]
);

/* ========================================================================== */
/* Shared automation / kernel seam (Part 07 stand-in)                         */
/* ========================================================================== */

/** Append-only audit log for anything the kernel (or a human) invokes — capability calls, nightly consolidation, etc. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    actorKind: text("actor_kind").notNull(), // human | kernel | system
    actorName: text("actor_name").notNull(),
    correlationId: text("correlation_id"),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_type_idx").on(t.type), index("audit_events_created_idx").on(t.createdAt)]
);

export type EntityRow = typeof entities.$inferSelect;
export type RelationRow = typeof relations.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type RetrospectiveRow = typeof retrospectives.$inferSelect;
export type HypothesisRow = typeof hypotheses.$inferSelect;
export type PlaybookRow = typeof playbooks.$inferSelect;
export type PlaybookRunRow = typeof playbookRuns.$inferSelect;
export type DocRow = typeof docs.$inferSelect;
export type DocVersionRow = typeof docVersions.$inferSelect;
