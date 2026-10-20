// LEADOS — Part 03 data model.
//
// Scope note (see docs/adr/0006-frontend-state-taxonomy-and-data-flow.md):
// this schema backs four domains named explicitly in the Part 03 brief as
// the long-list/virtualization targets — events, notifications, roster
// (people), findings — plus one cross-cutting `idempotencyKeys` table used
// by the mutation layer for safe retries. Multi-tenant/auth tables are out
// of scope for this part and are not fabricated here.

import { pgEnum, pgTable, text, integer, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";

export const notificationStatusEnum = pgEnum("notification_status", ["unread", "read", "archived"]);
export const findingStatusEnum = pgEnum("finding_status", ["open", "resolved"]);
export const rosterStatusEnum = pgEnum("roster_status", ["active", "leave", "offboarded"]);

// Append-mostly activity feed. Read-heavy, virtualized, server-rendered.
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    domain: text("domain").notNull(),
    severity: integer("severity").notNull().default(1),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("events_created_at_idx").on(table.createdAt)],
);

// Mutable, user-facing. The canonical mutation + undo demo target.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    domain: text("domain").notNull().default("general"),
    severity: integer("severity").notNull().default(1),
    status: notificationStatusEnum("status").notNull().default("unread"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_status_idx").on(table.status)],
);

// Read-mostly roster. Server-rendered + virtualized, no mutation surface yet.
export const roster = pgTable(
  "roster",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    team: text("team").notNull(),
    email: text("email").notNull(),
    status: rosterStatusEnum("status").notNull().default("active"),
    flightRisk: integer("flight_risk").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("roster_team_idx").on(table.team)],
);

// Mutable, filterable via URL state, the optimistic-create/update demo target.
export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    domain: text("domain").notNull().default("general"),
    team: text("team").notNull().default("Unassigned"),
    severity: integer("severity").notNull().default(1),
    status: findingStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("findings_status_idx").on(table.status), index("findings_domain_idx").on(table.domain)],
);

// Idempotency ledger for the mutation layer (Part 03 seam; Part 13 owns the
// full offline queue + durable retry story, see docs/FRONTEND.md "Seams").
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  route: text("route").notNull(),
  status: integer("status").notNull(),
  response: jsonb("response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EventRow = typeof events.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type RosterRow = typeof roster.$inferSelect;
export type FindingRow = typeof findings.$inferSelect;
