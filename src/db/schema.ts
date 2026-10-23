// LEADOS — Part 56: Algorithmic Accountability
//
// This schema backs:
//  - the model/system registry (Part 56 itself)
//  - stand-in persistence for Part 11 (model cards), Part 38 (monitoring /
//    assurance checks), Part 09 (fairness reports) and Part 19 (audit chain)
//    so the registry has real data to join against inside this sandbox.
//    NOTE (honesty): the actual Parts 09/11/19/38 tables are not present in
//    this repository snapshot. These tables are clearly-scoped stand-ins —
//    see AI-SESSION-LOG.md and the Part 56 self-review for what must be
//    reconciled against the real implementations.
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// People (demo identity directory — stand-in for a real auth/identity system)
// ---------------------------------------------------------------------------
export const people = pgTable("acc_people", {
  id: serial("id").primaryKey(),
  personKey: varchar("person_key", { length: 64 }).notNull().unique(),
  name: text("name").notNull(),
  role: varchar("role", { length: 24 }).notNull().$type<
    "subject" | "reviewer" | "auditor" | "admin" | "engineer"
  >(),
  note: text("note").notNull().default(""),
});

// ---------------------------------------------------------------------------
// Model / system registry (Part 56 core deliverable)
// ---------------------------------------------------------------------------
export const algoSystems = pgTable("algo_systems", {
  id: serial("id").primaryKey(),
  systemKey: varchar("system_key", { length: 120 }).notNull().unique(),
  name: text("name").notNull(),
  purpose: text("purpose").notNull(),
  affectedParties: varchar("affected_parties", { length: 32 })
    .notNull()
    .$type<"workers" | "customers" | "citizens">(),
  inputs: jsonb("inputs").notNull().$type<string[]>(),
  outputs: jsonb("outputs").notNull().$type<string[]>(),
  decisionRole: varchar("decision_role", { length: 16 })
    .notNull()
    .$type<"inform" | "recommend" | "automate">(),
  actionTier: varchar("action_tier", { length: 4 })
    .notNull()
    .$type<"T0" | "T1" | "T2" | "T3" | "T4">(),
  regulatoryTier: varchar("regulatory_tier", { length: 16 })
    .notNull()
    .$type<"minimal" | "limited" | "high" | "unacceptable">(),
  sourceModule: text("source_module").notNull(),
  owner: text("owner").notNull(),
  oversightOwner: text("oversight_owner").notNull(),
  oversightMethod: text("oversight_method").notNull(),
  oversightTrainingNotes: text("oversight_training_notes").notNull(),
  optOutAllowed: boolean("opt_out_allowed").notNull().default(false),
  optOutLimits: text("opt_out_limits").notNull().default(""),
  requiresHumanReview: boolean("requires_human_review").notNull().default(false),
  active: boolean("active").notNull().default(true),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Model cards (Part 11 stand-in)
// ---------------------------------------------------------------------------
export const modelCards = pgTable("model_cards", {
  id: serial("id").primaryKey(),
  systemKey: varchar("system_key", { length: 120 }).notNull(),
  name: text("name").notNull(),
  version: varchar("version", { length: 32 }).notNull(),
  summary: text("summary").notNull(),
  trainingData: text("training_data").notNull(),
  limitations: text("limitations").notNull(),
  metrics: jsonb("metrics").notNull().$type<Record<string, number>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Monitoring / assurance checks (Part 38 stand-in)
// ---------------------------------------------------------------------------
export const monitoringChecks = pgTable("monitoring_checks", {
  id: serial("id").primaryKey(),
  checkId: varchar("check_id", { length: 120 }).notNull().unique(),
  systemKey: varchar("system_key", { length: 120 }).notNull(),
  checkType: varchar("check_type", { length: 32 })
    .notNull()
    .$type<"drift" | "fairness" | "accuracy" | "availability">(),
  status: varchar("status", { length: 16 }).notNull().$type<"pass" | "warn" | "fail">(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull().defaultNow(),
  details: jsonb("details").notNull().$type<Record<string, unknown>>(),
});

// ---------------------------------------------------------------------------
// Fairness reports (Part 09 stand-in)
// ---------------------------------------------------------------------------
export const fairnessReports = pgTable("fairness_reports", {
  id: serial("id").primaryKey(),
  systemKey: varchar("system_key", { length: 120 }).notNull(),
  metric: text("metric").notNull(),
  groupA: text("group_a").notNull(),
  groupB: text("group_b").notNull(),
  valueA: real("value_a").notNull(),
  valueB: real("value_b").notNull(),
  disparityRatio: real("disparity_ratio").notNull(),
  threshold: real("threshold").notNull(),
  passed: boolean("passed").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Audit chain (Part 19 stand-in) — simple hash-linked append-only log
// ---------------------------------------------------------------------------
export const auditChainEntries = pgTable("audit_chain_entries", {
  id: serial("id").primaryKey(),
  seq: integer("seq").notNull(),
  systemKey: varchar("system_key", { length: 120 }).notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Impact assessments (algorithmic AIA-style), versioned per system
// ---------------------------------------------------------------------------
export const impactAssessments = pgTable("impact_assessments", {
  id: serial("id").primaryKey(),
  systemKey: varchar("system_key", { length: 120 }).notNull(),
  version: integer("version").notNull(),
  status: varchar("status", { length: 16 })
    .notNull()
    .$type<"draft" | "in_review" | "approved" | "superseded">(),
  purpose: text("purpose").notNull(),
  proportionality: text("proportionality").notNull(),
  affectedPartiesText: text("affected_parties_text").notNull(),
  risksToRights: text("risks_to_rights").notNull(),
  dataGovernance: text("data_governance").notNull(),
  humanOversightText: text("human_oversight_text").notNull(),
  accuracyRobustness: text("accuracy_robustness").notNull(),
  transparencyText: text("transparency_text").notNull(),
  linkedExperimentIds: jsonb("linked_experiment_ids").notNull().$type<string[]>(),
  triggeredBy: varchar("triggered_by", { length: 32 })
    .notNull()
    .$type<"initial" | "model_update" | "scheduled" | "incident">(),
  reviewerId: text("reviewer_id"),
  reviewerRole: text("reviewer_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Rights machinery: decisions, explanations, contestations, opt-outs
// ---------------------------------------------------------------------------
export const decisionRecords = pgTable("decision_records", {
  id: serial("id").primaryKey(),
  systemKey: varchar("system_key", { length: 120 }).notNull(),
  subjectId: varchar("subject_id", { length: 64 }).notNull(),
  decisionRole: varchar("decision_role", { length: 16 })
    .notNull()
    .$type<"inform" | "recommend" | "automate">(),
  outputSummary: jsonb("output_summary").notNull().$type<Record<string, unknown>>(),
  requiresHumanReview: boolean("requires_human_review").notNull().default(false),
  humanReviewStatus: varchar("human_review_status", { length: 16 })
    .notNull()
    .default("not_required")
    .$type<"not_required" | "pending" | "confirmed" | "overridden">(),
  humanReviewerId: text("human_reviewer_id"),
  humanReviewedAt: timestamp("human_reviewed_at", { withTimezone: true }),
  humanReviewNotes: text("human_review_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const explanations = pgTable("explanations", {
  id: serial("id").primaryKey(),
  decisionRecordId: integer("decision_record_id").notNull(),
  systemKey: varchar("system_key", { length: 120 }).notNull(),
  subjectId: varchar("subject_id", { length: 64 }).notNull(),
  summary: text("summary").notNull(),
  factors: jsonb("factors")
    .notNull()
    .$type<Array<{ factor: string; weight: number; direction: "increases" | "decreases" }>>(),
  modelCardRef: text("model_card_ref").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contestations = pgTable("contestations", {
  id: serial("id").primaryKey(),
  decisionRecordId: integer("decision_record_id").notNull(),
  subjectId: varchar("subject_id", { length: 64 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 16 })
    .notNull()
    .default("submitted")
    .$type<"submitted" | "under_review" | "upheld" | "overturned" | "dismissed">(),
  reviewerId: text("reviewer_id"),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const optOuts = pgTable("opt_outs", {
  id: serial("id").primaryKey(),
  systemKey: varchar("system_key", { length: 120 }).notNull(),
  subjectId: varchar("subject_id", { length: 64 }).notNull(),
  scope: text("scope").notNull(),
  status: varchar("status", { length: 16 })
    .notNull()
    .$type<"requested" | "active" | "denied">(),
  limitationsNote: text("limitations_note").notNull().default(""),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
});
