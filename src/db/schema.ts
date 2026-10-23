// src/db/schema.ts
//
// Part 52 adds a dedicated `leader_state` Postgres SCHEMA (a separate key
// space from every other Leados table) to hold leader-state data: decision
// logs, capacity/recovery signals, self-issued grants, and opt-in research
// contributions.
//
// STORAGE-LEVEL ISOLATION DESIGN (read this before touching these tables):
//   1. No code outside `src/lib/leaderState/repository.ts` may import these
//      table objects. That file is the single choke point and is the layer
//      that is unit-tested for the self-scope attempt matrix
//      (owner/admin/manager/system).
//   2. Row Level Security is enabled and FORCED on every table below as
//      defense-in-depth, scoped to `current_setting('app.current_user_id')`.
//      HONESTY CAVEAT (documented again in AI-SESSION-LOG.md): this sandbox's
//      app DB role is `postgres`, a superuser, and PostgreSQL superusers
//      always bypass RLS regardless of FORCE ROW LEVEL SECURITY. The RLS
//      policies are real and correct, but in THIS environment the tested,
//      load-bearing guarantee is the repository-layer enforcement, not RLS.
//      Deploying with a non-superuser application role is required for RLS
//      to add a second, independent enforcement layer in production.

import { boolean, integer, numeric, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const leaderStateSchema = pgSchema("leader_state");

/** A single logged decision, owned exclusively by the person who made it. */
export const leaderStateDecisions = leaderStateSchema.table("decisions", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  category: text("category").notNull().default("uncategorized"),
  stakes: integer("stakes").notNull(),
  timePressure: integer("time_pressure").notNull(),
  informationCompleteness: integer("information_completeness").notNull(),
  clarity: integer("clarity").notNull(),
  reversibility: text("reversibility").notNull(),
  selfRatedQuality: integer("self_rated_quality"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Self-issued, scoped, expiring consent to let another internal feature read a DERIVED signal. */
export const leaderStateGrants = leaderStateSchema.table("grants", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  scope: text("scope").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/** Daily recovery/meeting-load inputs, owned exclusively by the person they describe. */
export const leaderStateRecoverySignals = leaderStateSchema.table("recovery_signals", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD, person-local
  deepWorkBlocksPlanned: integer("deep_work_blocks_planned").notNull().default(0),
  deepWorkBlocksHonored: integer("deep_work_blocks_honored").notNull().default(0),
  quietHoursKept: boolean("quiet_hours_kept").notNull().default(false),
  meetingMinutes: integer("meeting_minutes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Opt-in anonymized-at-read-time research contributions, k-anonymity gated on read. */
export const leaderStateResearchContributions = leaderStateSchema.table("research_contributions", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  cohortKey: text("cohort_key").notNull(),
  metricType: text("metric_type").notNull(),
  metricValue: numeric("metric_value").notNull(),
  contributedAt: timestamp("contributed_at", { withTimezone: true }).notNull().defaultNow(),
});
