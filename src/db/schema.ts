import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

// ── People Intelligence ──────────────────────────────────────────
export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  department: text("department").notNull(),
  managerId: integer("manager_id"),
  performanceScore: real("performance_score").notNull().default(0.5),
  potentialScore: real("potential_score").notNull().default(0.5),
  flightRiskScore: real("flight_risk_score").notNull().default(0.2),
  burnoutRiskScore: real("burnout_risk_score").notNull().default(0.2),
  tenureMonths: integer("tenure_months").notNull().default(12),
  skills: jsonb("skills").$type<string[]>().notNull().default([]),
  isCritical: boolean("is_critical").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oneOnOnes = pgTable("one_on_ones", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").notNull(),
  notes: text("notes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Execution / Projects ─────────────────────────────────────────
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  durationDays: integer("duration_days").notNull().default(14),
  dependencies: jsonb("dependencies").$type<number[]>().notNull().default([]),
  ownerId: integer("owner_id"),
  deliveryConfidence: real("delivery_confidence").notNull().default(0.7),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Findings / Hypotheses / Rules / Playbooks ────────────────────
export const findings = pgTable("findings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  severity: text("severity").notNull().default("medium"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rules = pgTable("rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull().default("general"),
  weight: real("weight").notNull().default(1.0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hypotheses = pgTable("hypotheses", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  claim: text("claim").notNull(),
  resolveBy: timestamp("resolve_by", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("open"), // open|confirmed|refuted
  confidence: real("confidence").notNull().default(0.5),
  ruleId: integer("rule_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playbooks = pgTable("playbooks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  triggerCondition: text("trigger_condition").notNull().default(""),
});

export const playbookInstances = pgTable("playbook_instances", {
  id: serial("id").primaryKey(),
  playbookId: integer("playbook_id").notNull(),
  findingId: integer("finding_id").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Belief Fabric ─────────────────────────────────────────────────
export const beliefSnapshots = pgTable("belief_snapshots", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  node: text("node").notNull(),
  value: real("value").notNull(),
  snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Metrics ───────────────────────────────────────────────────────
export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("count"),
  baseline: real("baseline").notNull().default(0),
  stdDev: real("std_dev").notNull().default(1),
});

export const metricPoints = pgTable("metric_points", {
  id: serial("id").primaryKey(),
  metricId: integer("metric_id").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  value: real("value").notNull(),
});

// ── Knowledge Graph ───────────────────────────────────────────────
export const knowledgeNodes = pgTable("knowledge_nodes", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("finding"),
  label: text("label").notNull(),
  domain: text("domain").notNull().default("general"),
  severity: text("severity").notNull().default("medium"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeEdges = pgTable("knowledge_edges", {
  id: serial("id").primaryKey(),
  fromId: integer("from_id").notNull(),
  toId: integer("to_id").notNull(),
  relation: text("relation").notNull().default("caused_by"),
  weight: real("weight").notNull().default(1),
});

// ── Agent Cycle Runs ─────────────────────────────────────────────
export const agentCycleRuns = pgTable("agent_cycle_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  durationMs: integer("duration_ms").notNull(),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("ok"),
});

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  entityType: text("entity_type").notNull().default("system"),
  entityId: integer("entity_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
