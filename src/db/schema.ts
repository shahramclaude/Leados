// LEADOS canonical Drizzle schema.
//
// This file is the single source of truth for the Postgres schema. All
// access to these tables from application code MUST go through the
// repository layer in `src/lib/platform/repositories/` — see
// ARCHITECTURE.md for the enforced layering rules.
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leaders = pgTable("leaders", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role").notNull(),
  email: text("email").notNull().unique(),
  readinessScore: text("readiness_score"),
  readinessBand: text("readiness_band"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Append-only event log. This is the first artifact of the event-sourcing
// posture decided in docs/adr/0005-event-versioning-posture.md: every
// state-changing use case in `src/lib/app` writes one row here in addition
// to its primary read-model write. Events are versioned so that future
// parts can evolve payload shape without breaking historical rows.
export const eventLog = pgTable("event_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),
  eventVersion: text("event_version").notNull().default("1"),
  payload: jsonb("payload").notNull(),
  actor: text("actor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
