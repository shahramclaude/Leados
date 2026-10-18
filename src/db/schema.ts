import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────
// LeadOS intelligence schema
//
// `leados_people` holds the roster. `leados_events` is the single append-only
// event log that every domain (people / finance / sales / ops / strategy)
// writes to. The probabilistic intelligence engine (src/lib/*) reads only
// from these two tables — it never mutates them.
// ─────────────────────────────────────────────────────────────────────────

export const leados_people = pgTable("leados_people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  team: text("team").notNull().default(""),
  tenureStartAt: timestamp("tenure_start_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leados_events = pgTable("leados_events", {
  id: serial("id").primaryKey(),
  // One of the EventType values from src/lib/types.ts, kept as free text so
  // the event log can absorb new signal types without a migration.
  type: text("type").notNull(),
  domain: text("domain").notNull(), // people | finance | sales | ops | strategy
  personId: integer("person_id").references(() => leados_people.id),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
