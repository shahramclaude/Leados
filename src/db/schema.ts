// LEADOS — Part 47: Crisis Command & Continuity ("Crisis Ops")
//
// Integration note (read-before-write honesty disclosure — see
// AI-SESSION-LOG.md and the Part 47 report for the full finding):
// This repository checkout does NOT contain the files from Parts 10, 13, 14,
// 23, 24, 29, 31 or 35 referenced by the standing order — the working tree is
// the bare starter template. Rather than invent history that isn't present,
// this schema is built as a self-contained Crisis Ops module with explicit
// integration seams (columns / comments marked "SEAM:") where a later merge
// of those parts should wire in real sensing signals, kernel task scheduling,
// notification trees and chaos-framework hooks.
//
// All tables below are additive — nothing from the starter is touched.

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  serial,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const crisisStateEnum = pgEnum("crisis_state", [
  "normal",
  "elevated",
  "crisis",
  "recovery",
  "post_mortem",
  "closed",
]);

export const roleKeyEnum = pgEnum("crisis_role_key", [
  "commander",
  "deputy_commander",
  "comms_lead",
  "ops_lead",
  "liaison",
  "scribe",
  "legal",
  "board_liaison",
  "watch_officer",
]);

export const commsStatusEnum = pgEnum("comms_status", [
  "draft",
  "legal_review",
  "approved",
  "rejected",
  "sent",
  "send_failed",
]);

export const claimStatusEnum = pgEnum("claim_status", [
  "unconfirmed",
  "confirmed",
  "debunked",
]);

export const dependencyStatusEnum = pgEnum("dependency_status", [
  "up",
  "degraded",
  "down",
]);

export const assumptionStatusEnum = pgEnum("assumption_status", [
  "pending",
  "reverified_true",
  "reverified_false",
  "overdue",
]);

export const decisionStatusEnum = pgEnum("decision_status", [
  "open",
  "decided",
  "expired",
]);

export const drillStatusEnum = pgEnum("drill_status", [
  "scheduled",
  "running",
  "completed",
]);

export const injectTypeEnum = pgEnum("drill_inject_type", [
  "signal_storm",
  "dependency_outage",
  "false_rumor",
  "comms_error",
]);

// ---------------------------------------------------------------------------
// People (minimal persona directory — SEAM: replace with Part-?? identity/auth)
// ---------------------------------------------------------------------------

export const personas = pgTable("crisis_personas", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 160 }).notNull(),
  // roles this human is pre-authorized to hold during a crisis
  roleKeys: jsonb("role_keys").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Crisis classes — pre-configured command structure + dual-declaration rule
// ---------------------------------------------------------------------------

export const crisisClasses = pgTable("crisis_classes", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 60 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description").notNull().default(""),
  requiresDualDeclaration: boolean("requires_dual_declaration").notNull().default(false),
  // role keys that satisfy the dual-declaration requirement (at least 2 of)
  dualDeclarationRoleKeys: jsonb("dual_declaration_role_keys").$type<string[]>().notNull().default([]),
  // pre-configured command structure: roleKey -> true if required for this class
  roleTemplate: jsonb("role_template").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Crises — the state machine instance
// ---------------------------------------------------------------------------

export const crises = pgTable("crises", {
  id: uuid("id").defaultRandom().primaryKey(),
  classId: uuid("class_id").notNull().references(() => crisisClasses.id),
  title: varchar("title", { length: 200 }).notNull(),
  severity: integer("severity").notNull().default(3), // 1 (low) .. 5 (severe)
  state: crisisStateEnum("state").notNull().default("normal"),
  // commanderCompromised: Phase-5 scenario — when true, the authority matrix
  // routes commander-level actions to deputy_commander + board_liaison.
  commanderCompromised: boolean("commander_compromised").notNull().default(false),
  currentStatusVersion: integer("current_status_version").notNull().default(0),
  declaredByPersonaIds: jsonb("declared_by_persona_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  recoveryDeclaredAt: timestamp("recovery_declared_at", { withTimezone: true }),
  postMortemStartedAt: timestamp("post_mortem_started_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  isDrill: boolean("is_drill").notNull().default(false),
});

// ---------------------------------------------------------------------------
// Timeline — every action/event, timestamped, for the post-mortem
// ---------------------------------------------------------------------------

export const timelineEvents = pgTable("crisis_timeline_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  crisisId: uuid("crisis_id").notNull().references(() => crises.id),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  actorPersonaId: uuid("actor_persona_id").references(() => personas.id),
  actorLabel: varchar("actor_label", { length: 160 }).notNull().default("system"),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  summary: text("summary").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
});

// ---------------------------------------------------------------------------
// Role assignments (incident commander model)
// ---------------------------------------------------------------------------

export const roleAssignments = pgTable("crisis_role_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  crisisId: uuid("crisis_id").notNull().references(() => crises.id),
  roleKey: roleKeyEnum("role_key").notNull(),
  personaId: uuid("persona_id").notNull().references(() => personas.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  active: boolean("active").notNull().default(true),
});

// ---------------------------------------------------------------------------
// Authority matrix — who can commit what, pre-approved, during crisis
// ---------------------------------------------------------------------------

export const authorityGrants = pgTable("crisis_authority_grants", {
  id: uuid("id").defaultRandom().primaryKey(),
  roleKey: roleKeyEnum("role_key").notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  scope: varchar("scope", { length: 20 }).notNull().default("crisis"), // "normal" | "crisis"
  maxCommitUsd: numeric("max_commit_usd"),
  requiresDualControl: boolean("requires_dual_control").notNull().default(false),
});

// ---------------------------------------------------------------------------
// Decisions under pressure — time-boxed, with assumption registers
// ---------------------------------------------------------------------------

export const decisions = pgTable("crisis_decisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  crisisId: uuid("crisis_id").notNull().references(() => crises.id),
  title: varchar("title", { length: 200 }).notNull(),
  rationale: text("rationale").notNull().default(""),
  decidedByRoleKey: roleKeyEnum("decided_by_role_key").notNull(),
  decidedByPersonaId: uuid("decided_by_persona_id").references(() => personas.id),
  decideBy: timestamp("decide_by", { withTimezone: true }).notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  status: decisionStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assumptions = pgTable("crisis_assumptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  decisionId: uuid("decision_id").notNull().references(() => decisions.id),
  statement: text("statement").notNull(),
  confidence: varchar("confidence", { length: 20 }).notNull().default("medium"), // low|medium|high
  // SEAM: Part 10 kernel should own real task scheduling; here we store the
  // due timestamp and a status flag, and expose a /api/crisis/assumptions/tick
  // endpoint that a scheduler (cron, kernel task, or this project's own
  // worker) calls to evaluate overdue items and escalate.
  reverifyAt: timestamp("reverify_at", { withTimezone: true }).notNull(),
  status: assumptionStatusEnum("status").notNull().default("pending"),
  reverifiedAt: timestamp("reverified_at", { withTimezone: true }),
  reverifiedByPersonaId: uuid("reverified_by_persona_id").references(() => personas.id),
  reverificationNote: text("reverification_note"),
  escalated: boolean("escalated").notNull().default(false),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Comms: stakeholder groups, notification tree, templates, message queue
// ---------------------------------------------------------------------------

export const stakeholderGroups = pgTable("crisis_stakeholder_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 40 }).notNull().unique(), // internal|customer|regulatory|media
  name: varchar("name", { length: 120 }).notNull(),
  requiresLegalReview: boolean("requires_legal_review").notNull().default(false),
});

export const notificationContacts = pgTable("crisis_notification_contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id").notNull().references(() => stakeholderGroups.id),
  name: varchar("name", { length: 120 }).notNull(),
  channel: varchar("channel", { length: 20 }).notNull(), // email|sms|push
  dependencyKey: varchar("dependency_key", { length: 40 }).notNull(), // which circuit breaker gates this channel
  escalationOrder: integer("escalation_order").notNull().default(1),
  backupForContactId: uuid("backup_for_contact_id"),
});

export const messageTemplates = pgTable("crisis_message_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  classId: uuid("class_id").references(() => crisisClasses.id),
  groupId: uuid("group_id").notNull().references(() => stakeholderGroups.id),
  name: varchar("name", { length: 120 }).notNull(),
  subject: varchar("subject", { length: 200 }).notNull(),
  body: text("body").notNull(),
});

export const commsMessages = pgTable("crisis_comms_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  crisisId: uuid("crisis_id").notNull().references(() => crises.id),
  groupId: uuid("group_id").notNull().references(() => stakeholderGroups.id),
  templateId: uuid("template_id").references(() => messageTemplates.id),
  subject: varchar("subject", { length: 200 }).notNull(),
  body: text("body").notNull(),
  channel: varchar("channel", { length: 20 }).notNull().default("email"),
  status: commsStatusEnum("status").notNull().default("draft"),
  createdByPersonaId: uuid("created_by_persona_id").references(() => personas.id),
  legalReviewedByPersonaId: uuid("legal_reviewed_by_persona_id").references(() => personas.id),
  legalReviewedAt: timestamp("legal_reviewed_at", { withTimezone: true }),
  legalReviewNote: text("legal_review_note"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sendFailureReason: text("send_failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Rumor control — claims require double-sourcing before they can be treated
// as fact in crisis mode. Single-source items are quarantined as "unconfirmed".
// ---------------------------------------------------------------------------

export const claims = pgTable("crisis_claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  crisisId: uuid("crisis_id").notNull().references(() => crises.id),
  statement: text("statement").notNull(),
  status: claimStatusEnum("status").notNull().default("unconfirmed"),
  sources: jsonb("sources")
    .$type<{ name: string; type: string; reportedAt: string }[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Status page — the single source of truth, auto-versioned, append-only
// ---------------------------------------------------------------------------

export const statusPageUpdates = pgTable("crisis_status_updates", {
  id: uuid("id").defaultRandom().primaryKey(),
  crisisId: uuid("crisis_id").notNull().references(() => crises.id),
  version: integer("version").notNull(),
  headline: varchar("headline", { length: 200 }).notNull(),
  body: text("body").notNull(),
  severity: integer("severity").notNull().default(3),
  publishedByPersonaId: uuid("published_by_persona_id").references(() => personas.id),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Dependencies & circuit breakers (Part 35 concept, re-implemented here since
// Part 35's actual files are not present in this checkout — SEAM: merge)
// ---------------------------------------------------------------------------

export const dependencies = pgTable("crisis_dependencies", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  status: dependencyStatusEnum("status").notNull().default("up"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export const circuitBreakerEvents = pgTable("crisis_circuit_breaker_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  dependencyId: uuid("dependency_id").notNull().references(() => dependencies.id),
  fromStatus: dependencyStatusEnum("from_status").notNull(),
  toStatus: dependencyStatusEnum("to_status").notNull(),
  note: text("note").notNull().default(""),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Drills — org-level exercises with timers and injects (Part 35's chaos
// framework extended; re-implemented here for the same reason as above)
// ---------------------------------------------------------------------------

export const drills = pgTable("crisis_drills", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  classId: uuid("class_id").notNull().references(() => crisisClasses.id),
  crisisId: uuid("crisis_id").references(() => crises.id),
  status: drillStatusEnum("status").notNull().default("scheduled"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  transcript: jsonb("transcript").$type<Record<string, unknown>[]>().notNull().default([]),
});

export const drillInjects = pgTable("crisis_drill_injects", {
  id: uuid("id").defaultRandom().primaryKey(),
  drillId: uuid("drill_id").notNull().references(() => drills.id),
  type: injectTypeEnum("type").notNull(),
  sequence: integer("sequence").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  firedAt: timestamp("fired_at", { withTimezone: true }),
  outcome: text("outcome"),
  productFlowFailed: boolean("product_flow_failed").notNull().default(false),
  productFlowFailureNote: text("product_flow_failure_note"),
});

// ---------------------------------------------------------------------------
// Post-mortem learnings — capture → SEAM: Part 12 (knowledge base) / Part 30
// ---------------------------------------------------------------------------

export const learnings = pgTable("crisis_learnings", {
  id: uuid("id").defaultRandom().primaryKey(),
  crisisId: uuid("crisis_id").notNull().references(() => crises.id),
  category: varchar("category", { length: 60 }).notNull(), // process|tooling|comms|authority|detection
  statement: text("statement").notNull(),
  actionItem: text("action_item").notNull().default(""),
  ownerRoleKey: roleKeyEnum("owner_role_key"),
  targetSystem: varchar("target_system", { length: 60 }).notNull().default("unassigned"), // part12_knowledge_base | part30_* | unassigned
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Simple append-only audit counter for status page version numbers safety net
// ---------------------------------------------------------------------------

export const statusVersionCounters = pgTable("crisis_status_version_counters", {
  id: serial("id").primaryKey(),
  crisisId: uuid("crisis_id").notNull().references(() => crises.id).unique(),
  lastVersion: integer("last_version").notNull().default(0),
});
