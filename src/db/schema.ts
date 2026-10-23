// LEADOS — Part 46: Ethics, Safe Channels & Power Checks
//
// This repo instance did not already contain the Part 09 (fairness/privacy),
// Part 10 (power-tier policy engine), Part 23 (decision governance), Part 29
// (policy lifecycle), Part 31 (stakeholder graph) or Part 44 (Delphi) tables,
// so this file defines small, clearly-marked COMPATIBILITY tables that give
// those subsystems a real shape to integrate against, plus the full set of
// PART 46 tables that are the actual deliverable of this part.
//
// Column names are snake_case in the database; JS-side fields are camelCase.

import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------------ *
 * COMPATIBILITY LAYER — minimal stand-ins for prior parts
 * ------------------------------------------------------------------------ */

/** Part 31 — org directory / stakeholder graph nodes. */
export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: varchar("role", { length: 64 }).notNull(), // e.g. 'ombudsman', 'ethics_officer', 'manager', 'ic', 'ceo', 'admin'
  managerId: integer("manager_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Part 31 — stakeholder graph edges (undirected relationship distance). */
export const stakeholderEdges = pgTable("stakeholder_edges", {
  id: serial("id").primaryKey(),
  fromPersonId: integer("from_person_id").notNull(),
  toPersonId: integer("to_person_id").notNull(),
  relation: varchar("relation", { length: 32 }).notNull(), // 'reports_to' | 'collaborates_with' | 'influences'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Part 29 — minimal policy lifecycle record. */
export const policies = pgTable("policies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  status: varchar("status", { length: 24 }).notNull().default("draft"), // draft | active | retired
  changeLog: jsonb("change_log").$type<Array<{ at: string; note: string }>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Part 23 — decision governance record (major decisions requiring review). */
export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  decisionType: varchar("decision_type", { length: 48 }).notNull(),
  // Whether this decision concerns people-data processing, and whether the
  // affected people have been given visibility into it. These two fields are
  // the literal trigger condition for the PEOPLE_DATA_NO_VISIBILITY red flag.
  involvesPeopleData: boolean("involves_people_data").notNull().default(false),
  subjectsHaveVisibility: boolean("subjects_have_visibility").notNull().default(true),
  visibilityScope: varchar("visibility_scope", { length: 16 }).notNull().default("individual"), // 'individual' | 'bulk'
  reversibility: varchar("reversibility", { length: 24 }).notNull().default("reversible"), // reversible|partially_reversible|irreversible
  impact: varchar("impact", { length: 16 }).notNull().default("low"), // low|medium|high
  isPowerAction: boolean("is_power_action").notNull().default(false),
  powerActionType: varchar("power_action_type", { length: 48 }),
  primarySubjectPersonId: integer("primary_subject_person_id"),
  proposedByPersonId: integer("proposed_by_person_id").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("proposed"), // proposed|pending_review|approved|rejected
  // Part 23 "dissent visible" — dissent is always structurally visible.
  // dissentHidden exists ONLY so the red-flag corpus can exercise the
  // suppressed-dissent detector against a deliberately-misconfigured seed
  // record; the product never exposes UI to hide dissent.
  dissentNotes: jsonb("dissent_notes").$type<Array<{ byPersonId: number; note: string }>>().notNull().default([]),
  dissentHidden: boolean("dissent_hidden").notNull().default(false),
  structuredCriteria: jsonb("structured_criteria").$type<Record<string, number> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Generic append-only audit log (Part 09's audit.ts pattern). */
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id"),
  actorRole: varchar("actor_role", { length: 64 }),
  action: varchar("action", { length: 96 }).notNull(),
  resourceType: varchar("resource_type", { length: 64 }).notNull(),
  resourceId: varchar("resource_id", { length: 64 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Org-level configuration, e.g. dual-control approvers required per org. */
export const orgSettings = pgTable(
  "org_settings",
  {
    id: serial("id").primaryKey(),
    orgId: varchar("org_id", { length: 64 }).notNull().default("default"),
    key: varchar("key", { length: 96 }).notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("org_settings_org_key_uq").on(t.orgId, t.key)],
);

/* ------------------------------------------------------------------------ *
 * PART 46 — Ethical decision framework
 * ------------------------------------------------------------------------ */

export const ethicalRedFlagDefinitions = pgTable("ethical_red_flag_definitions", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  severity: varchar("severity", { length: 16 }).notNull(), // low | medium | high
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ethicalReviews = pgTable("ethical_reviews", {
  id: serial("id").primaryKey(),
  decisionId: integer("decision_id").notNull(),
  stakeholdersAffected: jsonb("stakeholders_affected")
    .$type<Array<{ personId: number; name: string; relation: string; hops: number }>>()
    .notNull()
    .default([]),
  // Loosely typed on purpose: these store Explain<T> values (interfaces,
  // not fresh object literals) which TS will not structurally match against
  // a Record<string, unknown> index signature. jsonb accepts any JSON value.
  harmBenefit: jsonb("harm_benefit").notNull(),
  reversibilityAssessment: jsonb("reversibility_assessment").notNull(),
  fairnessScan: jsonb("fairness_scan").notNull(),
  redFlags: jsonb("red_flags")
    .$type<Array<{ code: string; label: string; severity: string; explanation: string }>>()
    .notNull()
    .default([]),
  requiredSteps: jsonb("required_steps")
    .$type<Array<{ step: string; reason: string; mandatory: boolean }>>()
    .notNull()
    .default([]),
  decisionSupportNote: text("decision_support_note").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("completed"), // completed | pending_review
  createdByPersonId: integer("created_by_person_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------------ *
 * PART 46 — Safe channel (ombudsman-grade)
 * ------------------------------------------------------------------------ */

export const safeChannelReports = pgTable("safe_channel_reports", {
  id: serial("id").primaryKey(),
  caseRef: varchar("case_ref", { length: 32 }).notNull().unique(),
  category: varchar("category", { length: 48 }).notNull(),
  // Reporter identity is encrypted at rest. Empty strings mean "anonymous,
  // no identity captured at all" — encryption still applies to any optional
  // contact details the reporter chooses to leave for follow-up.
  reporterIdentityCiphertext: text("reporter_identity_ciphertext").notNull(),
  reporterIdentityIv: text("reporter_identity_iv").notNull(),
  reporterIdentityTag: text("reporter_identity_tag").notNull(),
  isAnonymous: boolean("is_anonymous").notNull().default(true),
  bodyCiphertext: text("body_ciphertext").notNull(),
  bodyIv: text("body_iv").notNull(),
  bodyTag: text("body_tag").notNull(),
  // A one-way lookup secret so an anonymous reporter can check case status
  // without any identity ever being stored for that purpose.
  lookupSecretHash: varchar("lookup_secret_hash", { length: 128 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("open"), // open|triage|investigate|resolved|closed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Audit of EVERY access attempt to the channel itself, granted or not. */
export const safeChannelAccessLog = pgTable("safe_channel_access_log", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  accessorPersonId: integer("accessor_person_id"),
  accessorRole: varchar("accessor_role", { length: 64 }),
  fieldAccessed: varchar("field_accessed", { length: 24 }).notNull(), // identity | body | metadata
  granted: boolean("granted").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Alerts raised by unauthorized or anomalous access to the channel. */
export const safeChannelAlerts = pgTable("safe_channel_alerts", {
  id: serial("id").primaryKey(),
  accessLogId: integer("access_log_id").notNull(),
  alertType: varchar("alert_type", { length: 48 }).notNull(),
  message: text("message").notNull(),
  acknowledged: boolean("acknowledged").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const safeChannelCaseEvents = pgTable("safe_channel_case_events", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  fromStatus: varchar("from_status", { length: 24 }).notNull(),
  toStatus: varchar("to_status", { length: 24 }).notNull(),
  actorPersonId: integer("actor_person_id"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Aggregate-only anti-retaliation signals tied to a case. */
export const antiRetaliationSignals = pgTable("anti_retaliation_signals", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  // The affected person is referenced only by a salted hash so that routine
  // dashboard queries never resolve to a name; only the case workflow
  // (already identity-restricted) can correlate it back.
  personHash: varchar("person_hash", { length: 128 }).notNull(),
  signalType: varchar("signal_type", { length: 48 }).notNull(), // role_change|negative_review|exclusion|compensation_cut|termination
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  recordedByPersonId: integer("recorded_by_person_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------------ *
 * PART 46 — Power checks (dual control)
 * ------------------------------------------------------------------------ */

export const dualControlActions = pgTable("dual_control_actions", {
  id: serial("id").primaryKey(),
  actionType: varchar("action_type", { length: 64 }).notNull(), // T4 action key
  orgId: varchar("org_id", { length: 64 }).notNull().default("default"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  requestedByPersonId: integer("requested_by_person_id").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("pending"), // pending|approved|rejected|executed
  executedAt: timestamp("executed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dualControlApprovals = pgTable(
  "dual_control_approvals",
  {
    id: serial("id").primaryKey(),
    actionId: integer("action_id").notNull(),
    approverPersonId: integer("approver_person_id").notNull(),
    decision: varchar("decision", { length: 16 }).notNull(), // approve | reject
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("dual_control_action_approver_uq").on(t.actionId, t.approverPersonId)],
);

export const dualControlViolationAttempts = pgTable("dual_control_violation_attempts", {
  id: serial("id").primaryKey(),
  actionId: integer("action_id").notNull(),
  attemptedByPersonId: integer("attempted_by_person_id").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------------ *
 * PART 46 — Conflict of interest registry
 * ------------------------------------------------------------------------ */

export const conflictDeclarations = pgTable("conflict_declarations", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").notNull(),
  interestDescription: text("interest_description").notNull(),
  relatedEntity: text("related_entity").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("active"), // active|recused|resolved
  declaredAt: timestamp("declared_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conflictRecusals = pgTable("conflict_recusals", {
  id: serial("id").primaryKey(),
  declarationId: integer("declaration_id").notNull(),
  decisionId: integer("decision_id").notNull(),
  recusedAt: timestamp("recused_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conflictProximityWarnings = pgTable("conflict_proximity_warnings", {
  id: serial("id").primaryKey(),
  decisionId: integer("decision_id").notNull(),
  personId: integer("person_id").notNull(),
  hops: integer("hops").notNull(),
  path: jsonb("path").$type<number[]>().notNull().default([]),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------------ *
 * PART 46 — Dissent preservation / whisper channel
 * ------------------------------------------------------------------------ */

export const dissentSuggestions = pgTable("dissent_suggestions", {
  id: serial("id").primaryKey(),
  body: text("body").notNull(),
  category: varchar("category", { length: 48 }).notNull().default("general"),
  // Only a one-way hash of a client-chosen claim code is stored — never an
  // identity — so the submitter alone can prove authorship later if they want to.
  claimTokenHash: varchar("claim_token_hash", { length: 128 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("open"), // open|acknowledged|actioned|archived
  archiveReason: text("archive_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dissentSuppressionAttempts = pgTable("dissent_suppression_attempts", {
  id: serial("id").primaryKey(),
  suggestionId: integer("suggestion_id").notNull(),
  attemptedByPersonId: integer("attempted_by_person_id").notNull(),
  attemptedByRole: varchar("attempted_by_role", { length: 64 }).notNull(),
  attemptedAction: varchar("attempted_action", { length: 24 }).notNull(), // delete|hide|suppress
  blocked: boolean("blocked").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Legitimate, dual-controlled archive requests for resolved suggestions. */
export const dissentArchiveRequests = pgTable("dissent_archive_requests", {
  id: serial("id").primaryKey(),
  suggestionId: integer("suggestion_id").notNull(),
  dualControlActionId: integer("dual_control_action_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
