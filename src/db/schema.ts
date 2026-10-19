// src/db/schema.ts
//
// Leados schema. Part 1 (belief fabric) + Part 2 (autonomous agent) tables.
// Applied directly via `npx drizzle-kit push` (no migration files in this
// sandbox workflow).

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────
// Core org data
// ─────────────────────────────────────────────────────────────────────────

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  teamId: text("team_id"),
  level: text("level"),
  startDate: timestamp("start_date", { withTimezone: true }),
  hasSuccessor: boolean("has_successor").default(false),
  calendarLoadPct: real("calendar_load_pct").default(0),
  flightRiskScore: real("flight_risk_score").default(0),
  status: text("status").default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    personId: integer("person_id").references(() => people.id),
    teamId: text("team_id"),
    projectId: integer("project_id"),
    domain: text("domain"),
    weight: real("weight").default(1),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    occurredAtIdx: index("events_occurred_at_idx").on(t.occurredAt),
    typeIdx: index("events_type_idx").on(t.type),
  }),
);

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").default("execution"),
  targetDate: timestamp("target_date", { withTimezone: true }),
  deliveryConfidence: real("delivery_confidence").default(80),
  previousDeliveryConfidence: real("previous_delivery_confidence").default(80),
  status: text("status").default("on_track"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  domain: text("domain").default("strategy"),
  confidence: real("confidence").default(50),
  deadline: timestamp("deadline", { withTimezone: true }),
  status: text("status").default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────
// Settings (key/value store used for flags, owners, degraded-mode, etc.)
// ─────────────────────────────────────────────────────────────────────────

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────
// Belief fabric (Part 1) persistence
// ─────────────────────────────────────────────────────────────────────────

export const beliefSnapshots = pgTable(
  "belief_snapshots",
  {
    id: serial("id").primaryKey(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
    posteriors: jsonb("posteriors").notNull(),
    cascadeRisk: real("cascade_risk").notNull(),
    dominantRisk: text("dominant_risk").notNull(),
    observables: jsonb("observables").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    snapshotAtIdx: index("belief_snapshots_snapshot_at_idx").on(t.snapshotAt),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// Rules + self-calibration
// ─────────────────────────────────────────────────────────────────────────

export const rules = pgTable("rules", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  baseSeverity: integer("base_severity").notNull().default(3),
  weight: real("weight").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const ruleEvaluations = pgTable(
  "rule_evaluations",
  {
    id: serial("id").primaryKey(),
    ruleKey: text("rule_key").notNull(),
    domain: text("domain").notNull(),
    fired: boolean("fired").notNull(),
    severity: integer("severity").notNull(),
    predictedProbability: real("predicted_probability").notNull().default(0),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).defaultNow(),
    outcomeRecorded: boolean("outcome_recorded").default(false),
    outcome: boolean("outcome"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    ruleKeyIdx: index("rule_evaluations_rule_key_idx").on(t.ruleKey),
    evaluatedAtIdx: index("rule_evaluations_evaluated_at_idx").on(t.evaluatedAt),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// Findings + notifications
// ─────────────────────────────────────────────────────────────────────────

export const findings = pgTable(
  "findings",
  {
    id: text("id").primaryKey(),
    ruleKey: text("rule_key").notNull(),
    domain: text("domain").notNull(),
    severity: integer("severity").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    cycleId: text("cycle_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    createdAtIdx: index("findings_created_at_idx").on(t.createdAt),
    domainIdx: index("findings_domain_idx").on(t.domain),
  }),
);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  severity: integer("severity").notNull().default(3),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────
// Playbooks (Part 1/2)
// ─────────────────────────────────────────────────────────────────────────

export const playbooks = pgTable("playbooks", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  ruleKey: text("rule_key").notNull(),
  steps: jsonb("steps").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// DDL (for reference — applied via drizzle-kit push, not a migration file):
// CREATE TABLE playbook_instances (
//   id SERIAL PRIMARY KEY,
//   playbook_id INTEGER REFERENCES playbooks(id),
//   status TEXT NOT NULL,
//   source TEXT NOT NULL,
//   trigger_finding_id TEXT,
//   assigned_to INTEGER REFERENCES people(id),
//   triggered_at TIMESTAMPTZ DEFAULT now(),
//   completed_at TIMESTAMPTZ
// );
export const playbookInstances = pgTable(
  "playbook_instances",
  {
    id: serial("id").primaryKey(),
    playbookId: integer("playbook_id").references(() => playbooks.id),
    status: text("status").notNull().default("triggered"),
    source: text("source").notNull().default("autonomous_agent"),
    triggerFindingId: text("trigger_finding_id"),
    assignedTo: integer("assigned_to").references(() => people.id),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }).defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("playbook_instances_status_idx").on(t.status),
    playbookIdx: index("playbook_instances_playbook_id_idx").on(t.playbookId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// Hypotheses (Part 2)
// ─────────────────────────────────────────────────────────────────────────

// DDL (for reference):
// CREATE TABLE hypotheses (
//   id TEXT PRIMARY KEY,
//   key TEXT NOT NULL,
//   entity_id TEXT NOT NULL,
//   entity_type TEXT NOT NULL,
//   claim TEXT NOT NULL,
//   predicted_by TIMESTAMPTZ NOT NULL,
//   resolve_by TIMESTAMPTZ NOT NULL,
//   status TEXT NOT NULL DEFAULT 'open',
//   outcome_note TEXT,
//   outcome_value REAL,
//   metric_to_check TEXT,
//   threshold REAL,
//   created_at TIMESTAMPTZ DEFAULT now(),
//   resolved_at TIMESTAMPTZ
// );
// -- Hypothesis dedup: only one OPEN hypothesis per (key, entity_id).
// CREATE UNIQUE INDEX hypotheses_open_key_entity_idx
//   ON hypotheses (key, entity_id) WHERE status = 'open';
export const hypotheses = pgTable(
  "hypotheses",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    entityId: text("entity_id").notNull(),
    entityType: text("entity_type").notNull(),
    claim: text("claim").notNull(),
    predictedBy: timestamp("predicted_by", { withTimezone: true }).notNull(),
    resolveBy: timestamp("resolve_by", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("open"),
    outcomeNote: text("outcome_note"),
    outcomeValue: real("outcome_value"),
    metricToCheck: text("metric_to_check"),
    threshold: real("threshold"),
    ruleKey: text("rule_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    // Partial unique index emulated here; the true partial-WHERE index is
    // created via raw SQL (see db/index.ts bootstrap / drizzle-kit push +
    // manual ALTER) because drizzle-orm's pg-core table builder does not
    // support partial unique indexes directly in this version.
    keyEntityIdx: uniqueIndex("hypotheses_key_entity_status_idx").on(
      t.key,
      t.entityId,
      t.status,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// Agent cycles + audit log (Part 2)
// ─────────────────────────────────────────────────────────────────────────

// DDL (for reference):
// CREATE TABLE agent_cycles (
//   id TEXT PRIMARY KEY,
//   started_at TIMESTAMPTZ NOT NULL,
//   completed_at TIMESTAMPTZ NOT NULL,
//   cascade_risk REAL NOT NULL,
//   priority TEXT NOT NULL,
//   findings_delta INTEGER NOT NULL DEFAULT 0,
//   playbooks_triggered INTEGER NOT NULL DEFAULT 0,
//   hypotheses_created INTEGER NOT NULL DEFAULT 0,
//   hypotheses_resolved INTEGER NOT NULL DEFAULT 0,
//   cycle_result JSONB NOT NULL
// );
export const agentCycles = pgTable(
  "agent_cycles",
  {
    id: text("id").primaryKey(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    cascadeRisk: real("cascade_risk").notNull(),
    priority: text("priority").notNull(),
    findingsDelta: integer("findings_delta").notNull().default(0),
    playbooksTriggered: integer("playbooks_triggered").notNull().default(0),
    hypothesesCreated: integer("hypotheses_created").notNull().default(0),
    hypothesesResolved: integer("hypotheses_resolved").notNull().default(0),
    cycleResult: jsonb("cycle_result").notNull(),
  },
  (t) => ({
    startedAtIdx: index("agent_cycles_started_at_idx").on(t.startedAt),
  }),
);

export const agentAuditLog = pgTable("agent_audit_log", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).defaultNow(),
  level: text("level").notNull(),
  message: text("message").notNull(),
  detail: jsonb("detail"),
});

// ─────────────────────────────────────────────────────────────────────────
// Weekly / morning briefing (Part 2 step 8)
// ─────────────────────────────────────────────────────────────────────────

export const weeklyBriefings = pgTable("weekly_briefings", {
  id: serial("id").primaryKey(),
  briefingDate: text("briefing_date").notNull(), // YYYY-MM-DD
  executiveSummary: text("executive_summary").notNull(),
  top3Priorities: jsonb("top3_priorities").notNull(),
  top3Risks: jsonb("top3_risks").notNull(),
  decisionsNeeded: jsonb("decisions_needed").notNull(),
  playbooksActive: integer("playbooks_active").notNull().default(0),
  hypothesesPending: integer("hypotheses_pending").notNull().default(0),
  uncertaintyStatement: text("uncertainty_statement").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
