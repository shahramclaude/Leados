// LEADOS — Part 08: Language intelligence schema.
//
// This file defines the persistence layer for the language-intelligence
// subsystem: org entities/events/metrics/docs that retrieval is grounded in,
// the knowledge-graph edges used for neighborhood expansion, the prompt /
// model-call audit trail, the capability-registry write log (Part 07 seam),
// capture proposals (assisted classification, human-gated), and findings
// raised by the nightly eval/cost scheduler.
//
// NOTE ON PROVENANCE: the repository snapshot handed to this part contained
// only the bare Next.js + Postgres starter template — none of the files the
// standing order asked us to read first (agentCore.ts, narrativeIntel.ts,
// synthesis.ts, docs.ts, livingDocs.ts, knowledgeGraph.ts,
// institutionalMemory.ts, search.ts, conversationIntelligence.ts,
// classify.ts, a briefing route, Part 04's Explain<T>, or Part 07's
// capability registry) existed yet. We say this plainly instead of
// pretending to have "read" files that are not in the repo. Everything
// below is built fresh, in the shape those parts are specified to own, so
// this part is self-consistent and the seams are honest stand-ins rather
// than silently-assumed prior art. See AI-SESSION-LOG.md for the full
// disclosure.

import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Org substrate: entities, events, metrics, docs, playbooks, graph edges.
// Retrieval (section C) is grounded in these tables — never in free text
// typed into a prompt.
// ---------------------------------------------------------------------------

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(), // "account" | "deal" | "person" | "team" | "product" ...
    name: text("name").notNull(),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("entities_type_idx").on(t.type)],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    type: text("type").notNull(), // "status_change" | "meeting" | "email" | "risk_flagged" ...
    summary: text("summary").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    source: text("source").notNull().default("manual"), // "manual" | "capture" | "integration"
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_entity_idx").on(t.entityId),
    index("events_occurred_idx").on(t.occurredAt),
  ],
);

export const metrics = pgTable(
  "metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    name: text("name").notNull(), // "delivery_confidence" | "pipeline_value" ...
    value: numeric("value", { precision: 14, scale: 4 }).notNull(),
    unit: text("unit").notNull().default("number"),
    asOf: timestamp("as_of", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("metrics_entity_idx").on(t.entityId),
    index("metrics_name_idx").on(t.name),
    index("metrics_asof_idx").on(t.asOf),
  ],
);

export const docs = pgTable(
  "docs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    docType: text("doc_type").notNull().default("note"), // "note" | "living" | "playbook_ref"
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    isLiving: boolean("is_living").notNull().default(false),
    lastRegeneratedAt: timestamp("last_regenerated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("docs_entity_idx").on(t.entityId)],
);

export const playbooks = pgTable("playbooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  steps: jsonb("steps").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Knowledge-graph edges between entities, used for neighborhood expansion
// (Part 11 seam) during hybrid retrieval.
export const graphEdges = pgTable(
  "graph_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromEntityId: uuid("from_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    toEntityId: uuid("to_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(), // "owns" | "depends_on" | "part_of" | "mentions" ...
    weight: numeric("weight", { precision: 6, scale: 3 }).notNull().default("1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("graph_edges_from_idx").on(t.fromEntityId),
    index("graph_edges_to_idx").on(t.toEntityId),
  ],
);

// Distilled institutional memory notes — "what we learned", each one
// required to carry evidence references back to events/docs.
export const memoryNotes = pgTable(
  "memory_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    evidenceRefs: jsonb("evidence_refs").$type<EvidenceRefRow[]>().notNull().default([]),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0.5"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("memory_notes_entity_idx").on(t.entityId)],
);

export type EvidenceRefRow = {
  kind: "entity" | "event" | "metric" | "doc" | "memory_note" | "finding";
  id: string;
  timestamp?: string;
  label?: string;
};

// ---------------------------------------------------------------------------
// Section B/D: model-call audit trail. Every model call that feeds the
// system is recorded here — actor, prompt version, model, tokens, latency,
// validation result, and cost.
// ---------------------------------------------------------------------------

export const modelCalls = pgTable(
  "model_calls",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorKind: text("actor_kind").notNull().default("agent"), // "agent" | "user" | "system"
    actorId: text("actor_id").notNull().default("system"),
    taskType: text("task_type").notNull(), // "classification" | "extraction" | "synthesis" | "planning" | "qa"
    promptName: text("prompt_name").notNull(),
    promptVersion: text("prompt_version").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    latencyMs: integer("latency_ms").notNull().default(0),
    attempt: integer("attempt").notNull().default(1),
    validationStatus: text("validation_status").notNull(), // "valid" | "repaired" | "failed"
    validationErrors: jsonb("validation_errors").$type<string[]>().notNull().default([]),
    degraded: boolean("degraded").notNull().default(false),
    requestHash: text("request_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("model_calls_task_idx").on(t.taskType),
    index("model_calls_created_idx").on(t.createdAt),
    index("model_calls_status_idx").on(t.validationStatus),
  ],
);

// Org-level cost budget with hard stop.
export const costBudgets = pgTable("cost_budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull().default("default"),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  budgetUsd: numeric("budget_usd", { precision: 10, scale: 2 }).notNull(),
  spentUsd: numeric("spent_usd", { precision: 10, scale: 2 }).notNull().default("0"),
  hardStop: boolean("hard_stop").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Section E.4 / F: assisted capture proposals. classify.ts turns raw text
// into a *proposed* structured event. Nothing here is auto-written to
// events — it must pass through the Part 07 capability registry's policy
// gate (approve/reject) in capabilityInvocations below.
// ---------------------------------------------------------------------------

export const captureProposals = pgTable(
  "capture_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceType: text("source_type").notNull(), // "note" | "email"
    rawText: text("raw_text").notNull(),
    redactedText: text("redacted_text").notNull(),
    proposedEntityType: text("proposed_entity_type"),
    proposedEntityName: text("proposed_entity_name"),
    proposedEvent: jsonb("proposed_event").$type<Record<string, unknown>>().notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    modelCallId: integer("model_call_id").references(() => modelCalls.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("capture_proposals_status_idx").on(t.status)],
);

// Part 07 seam: every write that a model-derived action makes must go
// through this registry, recording the capability invoked, the actor,
// params, validation result, approval and outcome.
export const capabilityInvocations = pgTable(
  "capability_invocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    capability: text("capability").notNull(), // e.g. "events.create"
    actorKind: text("actor_kind").notNull().default("agent"),
    actorId: text("actor_id").notNull().default("system"),
    params: jsonb("params").$type<Record<string, unknown>>().notNull(),
    validationStatus: text("validation_status").notNull(), // "valid" | "invalid"
    validationErrors: jsonb("validation_errors").$type<string[]>().notNull().default([]),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    approved: boolean("approved").notNull().default(false),
    approvedBy: text("approved_by"),
    status: text("status").notNull().default("pending"), // "pending" | "executed" | "rejected" | "failed"
    resultSummary: text("result_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("capability_invocations_status_idx").on(t.status)],
);

// ---------------------------------------------------------------------------
// Findings raised by the nightly eval/cost scheduler (Part 07 scheduler
// seam) on regression or budget breach.
// ---------------------------------------------------------------------------

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // "eval_regression" | "cost_budget_breach" | "injection_detected"
    severity: text("severity").notNull().default("medium"), // "low" | "medium" | "high"
    title: text("title").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("open"), // "open" | "acknowledged" | "resolved"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("findings_status_idx").on(t.status)],
);
