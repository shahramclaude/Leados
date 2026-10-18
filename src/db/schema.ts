import {
  pgTable,
  serial,
  text,
  integer,
  real,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import type { DecisionOption, DecisionData } from "@/lib/decisionTypes";

// ---------------------------------------------------------------------------
// Decisions — the core record of a tracked decision, from first options being
// weighed through to a recorded outcome and auto-generated post-mortem.
// ---------------------------------------------------------------------------
export const leadosDecisions = pgTable("leados_decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  domain: text("domain").notNull().default("general"),
  // open | decided | reversed | archived
  status: text("status").notNull().default("open"),
  options: jsonb("options").$type<DecisionOption[]>().notNull(),
  chosenOptionId: text("chosen_option_id"),
  rationale: text("rationale"),
  confidenceAtDecision: real("confidence_at_decision"),
  expectedOutcome: text("expected_outcome"),
  actualOutcome: text("actual_outcome"),
  // -1 (terrible outcome) .. 1 (great outcome)
  outcomeScore: real("outcome_score"),
  ownerId: integer("owner_id"),
  stakeholders: integer("stakeholders").array(),
  deadline: date("deadline"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  data: jsonb("data").$type<DecisionData>().notNull(),
});

// ---------------------------------------------------------------------------
// Decision log — an append-only audit trail of everything that happened to a
// decision (created, decided, reversed, outcome recorded, edited, ...).
// ---------------------------------------------------------------------------
export const leadosDecisionLog = pgTable("leados_decision_log", {
  id: serial("id").primaryKey(),
  decisionId: integer("decision_id")
    .notNull()
    .references(() => leadosDecisions.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  actor: text("actor").notNull().default("system"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Decision = typeof leadosDecisions.$inferSelect;
export type NewDecision = typeof leadosDecisions.$inferInsert;
export type DecisionLogEntry = typeof leadosDecisionLog.$inferSelect;
export type NewDecisionLogEntry = typeof leadosDecisionLog.$inferInsert;
