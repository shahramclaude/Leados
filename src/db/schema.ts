// LEADOS data model.
//
// `events` is the append-only backbone every domain engine ultimately derives
// its view from (see src/lib/domain/eventCatalog.ts for the schema registry).
// Part 5 (People & Organization Intelligence) additionally needs a small set
// of materialized tables — people, teams, 1:1s, growth plans, succession,
// consent, and an access-audit trail — because those surfaces need
// transactional CRUD + server-side access scoping, not just event replay.
// The timeline view still projects `events` for the "what happened and why"
// story; these tables hold current state.
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Part 0/2 backbone: append-only event log
// ---------------------------------------------------------------------------
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 255 }).notNull(),
  version: integer("version").notNull(),
  payload: jsonb("payload").notNull(),
  // Optional indexing hints so people-intelligence queries don't have to
  // scan + JSON-parse every row. Nullable because not every event concerns a
  // single person (e.g. system.ping).
  actorId: integer("actor_id"),
  subjectId: integer("subject_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Part 5: People & Organization Intelligence
// ---------------------------------------------------------------------------

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  department: varchar("department", { length: 255 }).notNull(),
  leadId: integer("lead_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  teamId: integer("team_id").references(() => teams.id),
  managerId: integer("manager_id"),
  hireDate: date("hire_date").notNull(),
  location: varchar("location", { length: 255 }).notNull(),
  employmentStatus: varchar("employment_status", { length: 50 }).notNull().default("active"),
  // Sensitive / field-redacted attributes. Never returned to a viewer who
  // isn't the person themself, their manager, HR, or an exec — see
  // src/lib/domain/people/privacy.ts.
  compaRatio: numeric("compa_ratio", { precision: 5, scale: 2 }),
  skills: jsonb("skills").notNull().default([]),
  goals: jsonb("goals").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const oneOnOnes = pgTable("one_on_ones", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").notNull().references(() => people.id),
  managerId: integer("manager_id").notNull().references(() => people.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("scheduled"),
  // Shared, co-edited agenda. Visible to the person + manager.
  sharedAgenda: jsonb("shared_agenda").notNull().default([]),
  // System-suggested talking points, derived from recent signals. Advisory
  // only — rendered as suggestions the manager can accept/discard, never
  // auto-sent to the employee. See oneOnOne.ts `suggestTalkingPoints`.
  talkingPointSuggestions: jsonb("talking_point_suggestions").notNull().default([]),
  // Commitments made during the 1:1. Each entry tracks follow-through.
  commitments: jsonb("commitments").notNull().default([]),
  // Manager-private notes. Never exposed to the person, peers, or anyone
  // without an HR/exec access grant. Enforced in oneOnOneRepository.ts.
  privateManagerNotes: text("private_manager_notes"),
  sharedSummary: text("shared_summary"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const growthPlans = pgTable("growth_plans", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").notNull().references(() => people.id),
  title: varchar("title", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const growthMilestones = pgTable("growth_milestones", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => growthPlans.id),
  title: varchar("title", { length: 255 }).notNull(),
  skill: varchar("skill", { length: 255 }).notNull(),
  targetDate: date("target_date"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  // Links to evidence: 1:1 commitment ids, event ids, artifact URLs.
  evidence: jsonb("evidence").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const consentRecords = pgTable("consent_records", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").notNull().references(() => people.id),
  noticeVersion: varchar("notice_version", { length: 50 }).notNull(),
  scope: varchar("scope", { length: 100 }).notNull(),
  granted: boolean("granted").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});

export const successionRoles = pgTable("succession_roles", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  teamId: integer("team_id").references(() => teams.id),
  criticality: varchar("criticality", { length: 20 }).notNull().default("high"),
  incumbentId: integer("incumbent_id").references(() => people.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const successionCandidates = pgTable("succession_candidates", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull().references(() => successionRoles.id),
  personId: integer("person_id").notNull().references(() => people.id),
  // 'ready_now' | 'ready_later' | 'develop'
  readiness: varchar("readiness", { length: 20 }).notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
  evidence: jsonb("evidence").notNull().default([]),
  gapPlan: text("gap_plan"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Every people-data read is logged here: who asked, about whom, what was
// returned vs. redacted, and why access was allowed/denied. This is the
// evidence trail for "privacy scoping enforced server-side."
export const accessAuditLog = pgTable("access_audit_log", {
  id: serial("id").primaryKey(),
  requesterId: integer("requester_id").notNull(),
  requesterRole: varchar("requester_role", { length: 50 }).notNull(),
  subjectId: integer("subject_id"),
  resource: varchar("resource", { length: 100 }).notNull(),
  fieldsRedacted: jsonb("fields_redacted").notNull().default([]),
  allowed: boolean("allowed").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
