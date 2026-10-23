import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", [
  "executive",
  "manager",
  "contributor",
]);

export const decisionStatusEnum = pgEnum("decision_status", [
  "proposed",
  "under_review",
  "committed",
  "reversed",
]);

export const decisionImpactEnum = pgEnum("decision_impact", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const signalSeverityEnum = pgEnum("signal_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const signalStatusEnum = pgEnum("signal_status", [
  "new",
  "investigating",
  "resolved",
  "dismissed",
]);

export const cadenceTypeEnum = pgEnum("cadence_type", [
  "standup",
  "weekly",
  "monthly",
  "quarterly",
  "adhoc",
]);

export const cadenceStatusEnum = pgEnum("cadence_status", [
  "scheduled",
  "completed",
  "skipped",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: userRoleEnum("role").notNull().default("contributor"),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: decisionStatusEnum("status").notNull().default("proposed"),
  impact: decisionImpactEnum("impact").notNull().default("medium"),
  confidence: integer("confidence").notNull().default(50),
  ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
  rationale: text("rationale").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

// Event-sourced audit trail for every decision mutation.
export const decisionEvents = pgTable("decision_events", {
  id: serial("id").primaryKey(),
  decisionId: integer("decision_id")
    .notNull()
    .references(() => decisions.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  actor: text("actor").notNull().default("system"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const signals = pgTable("signals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  severity: signalSeverityEnum("severity").notNull().default("medium"),
  status: signalStatusEnum("status").notNull().default("new"),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cadenceMeetings = pgTable("cadence_meetings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: cadenceTypeEnum("type").notNull().default("weekly"),
  ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
  status: cadenceStatusEnum("status").notNull().default("scheduled"),
  nextOccurrence: timestamp("next_occurrence", { withTimezone: true }).notNull(),
  effectivenessScore: integer("effectiveness_score"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentRuns = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: agentRunStatusEnum("status").notNull().default("queued"),
  input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
  output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
  summary: text("summary").notNull().default(""),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leaderStateEntries = pgTable("leader_state_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  decisionLoadScore: integer("decision_load_score").notNull().default(0),
  stressIndex: integer("stress_index").notNull().default(0),
  focusHours: numeric("focus_hours", { precision: 4, scale: 1 }).notNull().default("0"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Decision = typeof decisions.$inferSelect;
export type NewDecision = typeof decisions.$inferInsert;
export type DecisionEvent = typeof decisionEvents.$inferSelect;
export type Signal = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;
export type CadenceMeeting = typeof cadenceMeetings.$inferSelect;
export type NewCadenceMeeting = typeof cadenceMeetings.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type LeaderStateEntry = typeof leaderStateEntries.$inferSelect;
export type NewLeaderStateEntry = typeof leaderStateEntries.$inferInsert;
