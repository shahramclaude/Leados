// LEADOS data model — Part 7: Knowledge, Memory & the Learning Loop.
//
// Everything here backs the organization's durable brain:
//   - entities / relations        -> the knowledge graph
//   - events                      -> append-only backbone that relations/retrospectives are extracted from
//   - retrospectives              -> institutional memory (situation -> decision -> outcome -> lesson)
//   - hypotheses / hypothesisEvidence -> living bets with Bayesian evidence accumulation
//   - playbooks / playbookRuns / playbookCandidates -> executable, versioned, measured checklists
//   - livingDocs / livingDocVersions -> documents that render from live data blocks
//   - metrics / metricValues      -> the live data that living docs / search / synthesis cite
//   - searchDocuments / savedSearches -> the one search surface (keyword + fuzzy + graph-rank + recency)
//   - synthesisReports            -> weekly narrative synthesis with citations
//
// Nothing here stores a "fact" that should instead be recomputed — derived
// numbers (confidence decay, Brier scores, graph scores) are computed by the
// pure functions in `src/lib/**` from this data.
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Backbone: append-only event log. Knowledge-graph relations and
// institutional-memory retrospectives are extracted from structured events
// like these — never from private/unstructured content.
// ---------------------------------------------------------------------------
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 255 }).notNull(),
  payload: jsonb("payload").notNull().default({}),
  subjectType: varchar("subject_type", { length: 100 }),
  subjectId: varchar("subject_id", { length: 100 }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Knowledge graph: entities + typed relations.
// ---------------------------------------------------------------------------
export const entities = pgTable("entities", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  type: varchar("type", { length: 40 }).notNull(), // person|project|decision|hypothesis|metric|risk|playbook
  name: text("name").notNull(),
  description: text("description"),
  attributes: jsonb("attributes").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  typeIdx: index("entities_type_idx").on(table.type),
}));

export const relations = pgTable("relations", {
  id: serial("id").primaryKey(),
  fromEntityId: integer("from_entity_id").notNull().references(() => entities.id),
  toEntityId: integer("to_entity_id").notNull().references(() => entities.id),
  type: varchar("type", { length: 40 }).notNull(), // caused|blocked|informs|supersedes|owns
  weight: doublePrecision("weight").notNull().default(1),
  metadata: jsonb("metadata").notNull().default({}),
  sourceEventId: integer("source_event_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  fromIdx: index("relations_from_idx").on(table.fromEntityId),
  toIdx: index("relations_to_idx").on(table.toEntityId),
}));

// ---------------------------------------------------------------------------
// Institutional memory: structured retrospectives with decaying confidence.
// ---------------------------------------------------------------------------
export const retrospectives = pgTable("retrospectives", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  situation: text("situation").notNull(),
  decision: text("decision").notNull(),
  outcome: text("outcome").notNull(),
  lesson: text("lesson").notNull(),
  playbookUpdate: text("playbook_update"),
  tags: jsonb("tags").notNull().default([]),
  entityIds: jsonb("entity_ids").notNull().default([]),
  outcomeValence: varchar("outcome_valence", { length: 20 }).notNull().default("neutral"), // positive|negative|neutral
  baseConfidence: doublePrecision("base_confidence").notNull().default(0.6),
  evidenceCount: integer("evidence_count").notNull().default(1),
  occurredAt: date("occurred_at").notNull(),
  lastReinforcedAt: timestamp("last_reinforced_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Hypotheses: living bets with Bayesian evidence accumulation + resolution.
// ---------------------------------------------------------------------------
export const hypotheses = pgTable("hypotheses", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  ownerName: varchar("owner_name", { length: 120 }).notNull(),
  category: varchar("category", { length: 80 }),
  priorProbability: doublePrecision("prior_probability").notNull().default(0.5),
  currentProbability: doublePrecision("current_probability").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open"), // open|resolved_true|resolved_false|retired
  resolutionDate: date("resolution_date"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  outcome: boolean("outcome"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const hypothesisEvidence = pgTable("hypothesis_evidence", {
  id: serial("id").primaryKey(),
  hypothesisId: integer("hypothesis_id").notNull().references(() => hypotheses.id),
  description: text("description").notNull(),
  direction: varchar("direction", { length: 10 }).notNull(), // supports|against
  likelihoodRatio: doublePrecision("likelihood_ratio").notNull(),
  probabilityBefore: doublePrecision("probability_before").notNull(),
  probabilityAfter: doublePrecision("probability_after").notNull(),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Playbooks: executable checklists, versioned, with measured effectiveness.
// ---------------------------------------------------------------------------
export const playbooks = pgTable("playbooks", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  triggerConditions: jsonb("trigger_conditions").notNull().default([]),
  steps: jsonb("steps").notNull().default([]), // [{order,title,description,owner}]
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft|active|deprecated
  version: integer("version").notNull().default(1),
  changelog: jsonb("changelog").notNull().default([]), // [{version,date,note}]
  originRetrospectiveId: integer("origin_retrospective_id").references(() => retrospectives.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const playbookRuns = pgTable("playbook_runs", {
  id: serial("id").primaryKey(),
  playbookId: integer("playbook_id").notNull().references(() => playbooks.id),
  invokedBy: varchar("invoked_by", { length: 120 }).notNull(),
  invokedVia: varchar("invoked_via", { length: 20 }).notNull().default("human"), // human|automation
  context: jsonb("context").notNull().default({}),
  status: varchar("status", { length: 20 }).notNull().default("running"), // running|completed|failed
  stepResults: jsonb("step_results").notNull().default([]),
  outcomeDelta: doublePrecision("outcome_delta"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const playbookCandidates = pgTable("playbook_candidates", {
  id: serial("id").primaryKey(),
  sourceRetrospectiveId: integer("source_retrospective_id").notNull().references(() => retrospectives.id),
  suggestedTitle: text("suggested_title").notNull(),
  suggestedSteps: jsonb("suggested_steps").notNull().default([]),
  rationale: text("rationale").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("suggested"), // suggested|accepted|rejected
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Living documents: strategy docs / playbooks / policies rendered from blocks
// that reference live data (metrics, findings) + version history + approval.
// ---------------------------------------------------------------------------
export const livingDocs = pgTable("living_docs", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  title: text("title").notNull(),
  docType: varchar("doc_type", { length: 40 }).notNull().default("strategy"), // strategy|playbook|policy|whitepaper
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft|in_review|approved
  currentVersion: integer("current_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const livingDocVersions = pgTable("living_doc_versions", {
  id: serial("id").primaryKey(),
  docId: integer("doc_id").notNull().references(() => livingDocs.id),
  version: integer("version").notNull(),
  blocks: jsonb("blocks").notNull().default([]), // [{type:'text'|'metric'|'finding', ...}]
  renderedContent: text("rendered_content").notNull(),
  authorName: varchar("author_name", { length: 120 }).notNull(),
  changeNote: text("change_note"),
  approvedBy: varchar("approved_by", { length: 120 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  docVersionIdx: uniqueIndex("living_doc_versions_doc_version_idx").on(table.docId, table.version),
}));

// ---------------------------------------------------------------------------
// Metrics: the live data that living-doc blocks + search + synthesis cite.
// ---------------------------------------------------------------------------
export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 120 }).notNull().unique(),
  label: text("label").notNull(),
  unit: varchar("unit", { length: 30 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const metricValues = pgTable("metric_values", {
  id: serial("id").primaryKey(),
  metricKey: varchar("metric_key", { length: 120 }).notNull(),
  value: doublePrecision("value").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  metricKeyIdx: index("metric_values_metric_key_idx").on(table.metricKey),
}));

// ---------------------------------------------------------------------------
// Search: one denormalized index across entities, retrospectives,
// hypotheses, playbooks and living docs. Full-text (GIN) and trigram (GIN)
// expression indexes are created with raw SQL in drizzle/sql/extensions.sql
// because Drizzle's column builder does not express Postgres expression
// indexes — see docs/SEARCH.md.
// ---------------------------------------------------------------------------
export const searchDocuments = pgTable("search_documents", {
  id: serial("id").primaryKey(),
  sourceType: varchar("source_type", { length: 40 }).notNull(), // entity|retrospective|hypothesis|playbook|living_doc|metric
  sourceId: integer("source_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  tags: jsonb("tags").notNull().default([]),
  recencyAt: timestamp("recency_at", { withTimezone: true }).defaultNow().notNull(),
  graphScore: doublePrecision("graph_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sourceIdx: uniqueIndex("search_documents_source_idx").on(table.sourceType, table.sourceId),
}));

export const savedSearches = pgTable("saved_searches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  query: text("query").notNull().default(""),
  filters: jsonb("filters").notNull().default({}),
  createdBy: varchar("created_by", { length: 120 }).notNull().default("anonymous"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Synthesis: weekly narrative composed from findings/decisions/outcomes.
// ---------------------------------------------------------------------------
export const synthesisReports = pgTable("synthesis_reports", {
  id: serial("id").primaryKey(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  title: text("title").notNull(),
  narrative: text("narrative").notNull(),
  citations: jsonb("citations").notNull().default([]),
  template: varchar("template", { length: 40 }).notNull().default("weekly-v1"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
