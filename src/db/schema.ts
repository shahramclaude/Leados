// =============================================================================
// LEADOS — Part 23: Decision Operations substrate
// =============================================================================
// STANDING-ORDER NOTE (read-before-write discovery result):
// This sandbox does not contain the actual Parts 01/04/05/10/12 source files
// (no `src/lib/decision*`, no event-log substrate, no retrospectives, no task
// engine exist here — the repo was a bare Next.js+Drizzle starter). Part 23 is
// therefore built as a coherent, self-contained module that:
//   - stands in for Part 01's append-only event log (`eventLog` table below),
//     clearly labelled, so the Part-23 invariants (frozen record + correction
//     events) are real and testable today;
//   - stands in minimally for Part 10 (task engine) via `reviewTasks`, and for
//     Part 13 (sensing) via `sensorSignalReadings` — both flagged as STUB SEAM
//     and ledgered (see src/lib/decision/triggers.ts and AI-SESSION-LOG.md);
//   - stands in minimally for org/user identity (Parts 04/05) via `orgs`/`users`.
// When the real Parts 01/04/05/10/12 land in this repo, these stand-ins should
// be deleted and the decision tables re-pointed at the real substrates — the
// decision logic in src/lib/decision/** does not assume anything beyond the
// shapes defined here.
// =============================================================================

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  numeric,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// -----------------------------------------------------------------------------
// Identity stand-ins (Parts 04/05 substrate stand-in — minimal, flagged)
// -----------------------------------------------------------------------------

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role").notNull(), // e.g. 'lead' | 'manager' | 'ic' | 'exec'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------------------------------------------------------------
// Part 01 substrate stand-in: append-only event log
// -----------------------------------------------------------------------------

export const eventLog = pgTable(
  "event_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull(),
    entityType: text("entity_type").notNull(), // 'decision' | 'system' | ...
    entityId: uuid("entity_id"),
    type: text("type").notNull(), // e.g. 'decision.committed', 'decision.correction'
    payload: jsonb("payload").notNull().default({}),
    actorId: uuid("actor_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byEntity: index("event_log_entity_idx").on(t.entityType, t.entityId),
    byOrg: index("event_log_org_idx").on(t.orgId),
  }),
);

// -----------------------------------------------------------------------------
// Decision rights (RACI-style) configuration per org per decision class
// -----------------------------------------------------------------------------

export const decisionRightsConfigs = pgTable(
  "decision_rights_configs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    decisionClass: text("decision_class").notNull(),
    deciderRole: text("decider_role"), // null => ambiguity finding
    consultedRoles: jsonb("consulted_roles").notNull().default([]),
    informedRoles: jsonb("informed_roles").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqClass: uniqueIndex("drc_org_class_uniq").on(t.orgId, t.decisionClass),
  }),
);

// -----------------------------------------------------------------------------
// Decisions — the frozen-at-commit record
// -----------------------------------------------------------------------------
// Frozen fields (immutable once committedAt is set) are enforced by a Postgres
// trigger (see src/lib/decision/dbSetup.ts) in addition to application logic,
// so there is no mutation path — app-level or raw-SQL — after commit.

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    decisionClass: text("decision_class").notNull(),

    // funnel: raised -> framed -> evidence_gathered -> decided -> reviewed
    status: text("status").notNull().default("raised"),

    question: text("question").notNull(),
    decisionType: text("decision_type").notNull(), // 'type1' | 'type2'

    optionsConsidered: jsonb("options_considered").notNull().default([]),
    optionEvidence: jsonb("option_evidence").notNull().default({}), // Record<option, Explain<T>>

    chosen: text("chosen"),
    choiceRationale: text("choice_rationale"),

    dissentSnapshot: jsonb("dissent_snapshot").notNull().default([]), // frozen at commit

    expectedOutcome: text("expected_outcome"),
    expectedInterval: jsonb("expected_interval"), // {low, high, unit}
    confidenceClass: text("confidence_class"), // 'low' | 'medium' | 'high'
    reviewAt: timestamp("review_at", { withTimezone: true }),

    decidedBy: uuid("decided_by"),
    decisionRightsSnapshot: jsonb("decision_rights_snapshot"), // frozen RACI at commit

    reversibilityPlan: text("reversibility_plan"),
    triggerConditions: jsonb("trigger_conditions").notNull().default([]), // [{signal, op, value}]

    impact: integer("impact").notNull().default(3), // 1-5, explicit input
    raisedBy: uuid("raised_by"),

    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
    framedAt: timestamp("framed_at", { withTimezone: true }),
    evidenceGatheredAt: timestamp("evidence_gathered_at", { withTimezone: true }),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOrgStatus: index("decisions_org_status_idx").on(t.orgId, t.status),
  }),
);

// Dissent captured during framing; snapshotted into decisions.dissentSnapshot at
// commit time. Rows added after committedAt is set are "late dissent" — never
// rewrite the frozen snapshot, always visible as addenda (honesty rule).
export const decisionDissent = pgTable("decision_dissent", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  decisionId: uuid("decision_id").notNull().references(() => decisions.id, { onDelete: "cascade" }),
  who: uuid("who"),
  whoName: text("who_name").notNull(),
  theCase: text("the_case").notNull(),
  response: text("response"),
  isLate: boolean("is_late").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Time-in-state funnel transitions, the basis of velocity metrics.
export const decisionStateTransitions = pgTable(
  "decision_state_transitions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    decisionId: uuid("decision_id").notNull().references(() => decisions.id, { onDelete: "cascade" }),
    fromState: text("from_state"),
    toState: text("to_state").notNull(),
    actorId: uuid("actor_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byDecision: index("dst_decision_idx").on(t.decisionId),
  }),
);

// Corrections — never edits. Append-only clarifications/addenda to a frozen record.
export const decisionCorrections = pgTable("decision_corrections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  decisionId: uuid("decision_id").notNull().references(() => decisions.id, { onDelete: "cascade" }),
  correctionType: text("correction_type").notNull(), // 'clarification' | 'late_dissent' | 'outcome_note'
  note: text("note").notNull(),
  payload: jsonb("payload").notNull().default({}),
  actorId: uuid("actor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Decision-quality scorecard — diagnostic, per decision, append-only (history kept).
export const decisionQualityScores = pgTable("decision_quality_scores", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  decisionId: uuid("decision_id").notNull().references(() => decisions.id, { onDelete: "cascade" }),
  frame: integer("frame").notNull(),
  options: integer("options").notNull(),
  evidence: integer("evidence").notNull(),
  expectations: integer("expectations").notNull(),
  reversibility: integer("reversibility").notNull(),
  review: integer("review").notNull(),
  dq: integer("dq").notNull(),
  autoDq: integer("auto_dq").notNull(),
  gamingRisk: boolean("gaming_risk").notNull().default(false),
  scoredBy: text("scored_by").notNull(), // rater display name/id
  notes: jsonb("notes").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Pre-mortems — "assume this failed — why?"
export const preMortems = pgTable("pre_mortems", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  decisionId: uuid("decision_id").notNull().references(() => decisions.id, { onDelete: "cascade" }),
  scenario: text("scenario").notNull().default("Assume this decision failed. Why?"),
  reasons: jsonb("reasons").notNull().default([]), // string[]
  mitigations: jsonb("mitigations").notNull().default([]), // string[]
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Decision journal — personal + org, feeds Part 12's retrospectives (stub seam: we
// emit an eventLog entry `journal.entry_created` that Part 12 would subscribe to).
export const decisionJournalEntries = pgTable("decision_journal_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  decisionId: uuid("decision_id").references(() => decisions.id, { onDelete: "set null" }),
  userId: uuid("user_id"),
  whatIDecided: text("what_i_decided").notNull(),
  whatIExpected: text("what_i_expected").notNull(),
  whatHappened: text("what_happened"),
  whatILearned: text("what_i_learned"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Trigger watches — evaluated against signal readings (Part 13 stub seam below).
export const decisionTriggerWatches = pgTable("decision_trigger_watches", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  decisionId: uuid("decision_id").notNull().references(() => decisions.id, { onDelete: "cascade" }),
  signal: text("signal").notNull(),
  thresholdOp: text("threshold_op").notNull(), // 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
  thresholdValue: numeric("threshold_value").notNull(),
  status: text("status").notNull().default("watching"), // 'watching' | 'breached' | 'resolved'
  lastValue: numeric("last_value"),
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
  breachedAt: timestamp("breached_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Part 13 (sensing) STUB SEAM: manual signal ingestion until the real sensing
// pipeline exists. See src/lib/decision/triggers.ts for the documented seam.
export const sensorSignalReadings = pgTable(
  "sensor_signal_readings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull(),
    signal: text("signal").notNull(),
    value: numeric("value").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySignal: index("ssr_signal_idx").on(t.orgId, t.signal),
  }),
);

// Part 10 (task engine) STUB SEAM: minimal review-task sink so a breached
// trigger can "auto-open a review task" end-to-end today.
export const reviewTasks = pgTable("review_tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  decisionId: uuid("decision_id").references(() => decisions.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("open"), // 'open' | 'done'
  dueAt: timestamp("due_at", { withTimezone: true }),
  source: text("source").notNull(), // 'trigger_breach' | 'calendar'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
