// LEADOS — Part 45: Time & Meeting Economics
//
// This file defines all persistence for the Time-Economics engine:
// meeting cost/value, attention fragmentation, calendar optimization
// (suggestion-only, never auto-booking), and strategy-time classification.
//
// PRIVACY NOTE (Part 09 rule, applied strictly): fine-grained individual
// time data (interactionEvents, per-meeting cost/attendance detail,
// fragmentation timelines) is SELF-OWNED. Managers/admins only ever see
// k-anonymized aggregates unless a user explicitly opts in via
// `timeDataConsent.allowManagerView`. Every read of another person's
// individual time data is written to `privacyAuditLog`, allowed or not.

import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Core org / people
// ---------------------------------------------------------------------------

export const orgs = pgTable("te_orgs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** chronotype: literature-grounded self-report (Horne-Östberg style bucket). */
export const users = pgTable("te_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"), // member | manager | admin | finance
  timezone: text("timezone").notNull().default("UTC"), // IANA tz, Part 37 dependency
  chronotype: text("chronotype").notNull().default("intermediate"), // lark | intermediate | owl
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  emailOrgUnique: uniqueIndex("te_users_org_email_idx").on(t.orgId, t.email),
}));

export const teams = pgTable("te_teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});

export const teamMembers = pgTable("te_team_members", {
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.teamId, t.userId] }),
}));

// ---------------------------------------------------------------------------
// Org configuration for the cost model (method transparency — Phase 1)
// ---------------------------------------------------------------------------

export const orgConfig = pgTable("te_org_config", {
  orgId: uuid("org_id").primaryKey().references(() => orgs.id, { onDelete: "cascade" }),
  currency: text("currency").notNull().default("USD"),
  defaultLoadedHourlyRate: numeric("default_loaded_hourly_rate", { precision: 10, scale: 2 })
    .notNull()
    .default("85.00"),
  // Multiplier applied to a deep-work interruption's base switching cost to
  // produce an "opportunity cost" dollar figure. This is the single most
  // speculative number in the whole model — see MODEL CARD §4.
  deepWorkPremiumMultiplier: numeric("deep_work_premium_multiplier", { precision: 6, scale: 2 })
    .notNull()
    .default("1.50"),
  // Minutes of recovery/refocus time lost per interruption of deep work.
  // Default sourced from Mark, Gudith & Klocke (2008); org can override.
  recoveryMinutesPerInterruption: integer("recovery_minutes_per_interruption").notNull().default(23),
  workDayStartMinute: integer("work_day_start_minute").notNull().default(9 * 60),
  workDayEndMinute: integer("work_day_end_minute").notNull().default(17 * 60),
  zeroOutcomeWeeksThreshold: integer("zero_outcome_weeks_threshold").notNull().default(6),
});

/** Loaded hourly rate per person — sensitive (comp-adjacent). Finance/admin write; self + finance/admin read. */
export const userRates = pgTable("te_user_rates", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  loadedHourlyRate: numeric("loaded_hourly_rate", { precision: 10, scale: 2 }).notNull(),
  method: text("method").notNull().default("org_default"), // org_default | banded_estimate | hr_provided
});

// ---------------------------------------------------------------------------
// Calendar / meetings
// ---------------------------------------------------------------------------

export const strategyPillars = pgTable("te_strategy_pillars", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Intended allocation of organizational time to this pillar (Part 07 strategy map).
  targetAllocationPct: numeric("target_allocation_pct", { precision: 5, scale: 2 }).notNull(),
});

/** Keyword/topic -> pillar weights used by the classifier (Phase 1 "time-allocation truth"). */
export const topicStrategyMap = pgTable("te_topic_strategy_map", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  topicKeyword: text("topic_keyword").notNull(),
  pillarId: uuid("pillar_id").references(() => strategyPillars.id, { onDelete: "set null" }),
  category: text("category").notNull(), // strategic | operational | reactive
  weight: numeric("weight", { precision: 4, scale: 2 }).notNull().default("1.00"),
});

export const calendarEvents = pgTable("te_calendar_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  topic: text("topic").notNull().default(""),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurrenceKey: text("recurrence_key"), // groups instances of the same recurring meeting
  ritualId: uuid("ritual_id"), // FK into Part 25's ritual engine (stand-in, no hard FK)
  organizerId: uuid("organizer_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const eventAttendees = pgTable("te_event_attendees", {
  eventId: uuid("event_id").notNull().references(() => calendarEvents.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  required: boolean("required").notNull().default(true),
}, (t) => ({
  pk: primaryKey({ columns: [t.eventId, t.userId] }),
}));

/** Stand-in for Part 25's ritual capture: decisions + actions logged per meeting instance. */
export const meetingOutcomes = pgTable("te_meeting_outcomes", {
  eventId: uuid("event_id").primaryKey().references(() => calendarEvents.id, { onDelete: "cascade" }),
  decisionsCount: integer("decisions_count").notNull().default(0),
  actionsCount: integer("actions_count").notNull().default(0),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  source: text("source").notNull().default("ritual_capture"),
});

export const meetingClassifications = pgTable("te_meeting_classifications", {
  eventId: uuid("event_id").primaryKey().references(() => calendarEvents.id, { onDelete: "cascade" }),
  category: text("category").notNull(), // strategic | operational | reactive
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(), // 0..1, ALWAYS rendered in UI
  pillarId: uuid("pillar_id").references(() => strategyPillars.id, { onDelete: "set null" }),
  method: text("method").notNull().default("keyword_weighted"),
  classifiedAt: timestamp("classified_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Attention / fragmentation (individual-level — privacy sensitive)
// ---------------------------------------------------------------------------

export const interactionEvents = pgTable("te_interaction_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  type: text("type").notNull(), // context_switch | focus_start | focus_end | meeting_start | meeting_end
  metadata: jsonb("metadata"),
});

export const noMeetingWindows = pgTable("te_no_meeting_windows", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(), // org | team | user
  scopeId: uuid("scope_id"), // teamId or userId depending on scope; null when scope=org
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun..6=Sat
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  enforced: boolean("enforced").notNull().default(false), // false = advisory, true = policy-blocking
  label: text("label").notNull().default("Deep work"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Calendar optimizer — suggestions only, T2-gated confirmation
// ---------------------------------------------------------------------------

export const schedulingSuggestions = pgTable("te_scheduling_suggestions", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
  payload: jsonb("payload").notNull(), // { title, durationMinutes, attendeeIds, constraints, candidateSlots[] }
  chosenSlot: jsonb("chosen_slot"), // set once a human picks one candidate
  status: text("status").notNull().default("proposed"), // proposed | confirmed | rejected
  confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Privacy layer
// ---------------------------------------------------------------------------

export const timeDataConsent = pgTable("te_time_data_consent", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  shareAggregateOnly: boolean("share_aggregate_only").notNull().default(true),
  allowManagerView: boolean("allow_manager_view").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const privacyAuditLog = pgTable("te_privacy_audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id").notNull(),
  targetUserId: uuid("target_user_id"),
  resource: text("resource").notNull(),
  allowed: boolean("allowed").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
