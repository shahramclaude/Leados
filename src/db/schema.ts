// ---------------------------------------------------------------------------
// LEADOS — Part 9: Institutional Memory & Knowledge Graph
// ---------------------------------------------------------------------------
// Two layers of tables:
//  1. Supporting organizational entities (people, metrics, decisions,
//     findings, playbooks, a raw org event log) — this gives the knowledge
//     graph real source material to ingest.
//  2. The knowledge graph itself (memory nodes/edges), generated insights,
//     and playbook execution history.
import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Organizational source data
// ---------------------------------------------------------------------------

export const leadosPeople = pgTable("leados_people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  domain: text("domain").notNull().default("General"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type LeadosPerson = typeof leadosPeople.$inferSelect;
export type NewLeadosPerson = typeof leadosPeople.$inferInsert;

export const leadosMetrics = pgTable("leados_metrics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull().default("General"),
  value: real("value").notNull().default(0),
  unit: text("unit").notNull().default(""),
  trend: text("trend").notNull().default("flat"), // up|down|flat
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});
export type LeadosMetric = typeof leadosMetrics.$inferSelect;
export type NewLeadosMetric = typeof leadosMetrics.$inferInsert;

export const leadosDecisions = pgTable("leados_decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  rationale: text("rationale").notNull().default(""),
  domain: text("domain").notNull().default("General"),
  personId: integer("person_id").references(() => leadosPeople.id),
  metricRef: text("metric_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type LeadosDecision = typeof leadosDecisions.$inferSelect;
export type NewLeadosDecision = typeof leadosDecisions.$inferInsert;

export const leadosFindings = pgTable("leados_findings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  domain: text("domain").notNull().default("General"),
  severity: integer("severity").notNull().default(1), // 1..5
  status: text("status").notNull().default("open"), // open|resolved
  personId: integer("person_id").references(() => leadosPeople.id),
  metricRef: text("metric_ref"),
  ruleId: text("rule_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});
export type LeadosFinding = typeof leadosFindings.$inferSelect;
export type NewLeadosFinding = typeof leadosFindings.$inferInsert;

export const leadosPlaybooks = pgTable("leados_playbooks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull().default("General"),
  triggerRule: text("trigger_rule").notNull().default(""),
  steps: jsonb("steps").notNull().default([]), // string[]
  successRate: real("success_rate").notNull().default(0.5),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type LeadosPlaybook = typeof leadosPlaybooks.$inferSelect;
export type NewLeadosPlaybook = typeof leadosPlaybooks.$inferInsert;

export const leadosOrgEvents = pgTable("leados_org_events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  domain: text("domain").notNull().default("General"),
  personId: integer("person_id").references(() => leadosPeople.id),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  metricRef: text("metric_ref"),
  findingId: integer("finding_id").references(() => leadosFindings.id),
  decisionId: integer("decision_id").references(() => leadosDecisions.id),
  playbookId: integer("playbook_id").references(() => leadosPlaybooks.id),
  tags: text("tags").array().notNull().default([]),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  processed: boolean("processed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type LeadosOrgEvent = typeof leadosOrgEvents.$inferSelect;
export type NewLeadosOrgEvent = typeof leadosOrgEvents.$inferInsert;

// ---------------------------------------------------------------------------
// Knowledge graph
// ---------------------------------------------------------------------------

export const leadosMemoryNodes = pgTable("leados_memory_nodes", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // person|decision|metric|event|finding|playbook|insight|domain
  entityId: text("entity_id").notNull(),
  label: text("label").notNull(),
  summary: text("summary").notNull().default(""),
  embeddingStub: text("embedding_stub").notNull().default(""), // first 256 chars of content, for text search
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type LeadosMemoryNode = typeof leadosMemoryNodes.$inferSelect;
export type NewLeadosMemoryNode = typeof leadosMemoryNodes.$inferInsert;

export const leadosMemoryEdges = pgTable("leados_memory_edges", {
  id: serial("id").primaryKey(),
  fromNodeId: integer("from_node_id")
    .notNull()
    .references(() => leadosMemoryNodes.id, { onDelete: "cascade" }),
  toNodeId: integer("to_node_id")
    .notNull()
    .references(() => leadosMemoryNodes.id, { onDelete: "cascade" }),
  relation: text("relation").notNull(), // caused|informed|resolved|escalated|blocked|created|modified|triggered
  weight: real("weight").notNull().default(1),
  evidence: text("evidence").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type LeadosMemoryEdge = typeof leadosMemoryEdges.$inferSelect;
export type NewLeadosMemoryEdge = typeof leadosMemoryEdges.$inferInsert;

export const leadosInsights = pgTable("leados_insights", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // pattern|anomaly|prediction|lesson
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  sourceNodes: integer("source_nodes").array().notNull().default([]),
  confidence: real("confidence").notNull().default(0.5),
  status: text("status").notNull().default("new"), // new|reviewed|archived
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type LeadosInsight = typeof leadosInsights.$inferSelect;
export type NewLeadosInsight = typeof leadosInsights.$inferInsert;

export const leadosPlaybookRuns = pgTable("leados_playbook_runs", {
  id: serial("id").primaryKey(),
  playbookId: integer("playbook_id")
    .notNull()
    .references(() => leadosPlaybooks.id, { onDelete: "cascade" }),
  triggeredBy: text("triggered_by").notNull().default(""), // e.g. finding id / rule id
  personId: integer("person_id").references(() => leadosPeople.id),
  status: text("status").notNull().default("running"), // running|completed|abandoned
  stepsTotal: integer("steps_total").notNull().default(1),
  stepsDone: integer("steps_done").notNull().default(0),
  outcomeScore: real("outcome_score"),
  notes: text("notes").notNull().default(""),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
export type LeadosPlaybookRun = typeof leadosPlaybookRuns.$inferSelect;
export type NewLeadosPlaybookRun = typeof leadosPlaybookRuns.$inferInsert;
