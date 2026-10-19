import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

// Leados event log — append-only event-sourced store. Every domain
// (people, finance, strategy, execution, rd, sales, knowledge,
// manufacturing) is derived purely by projecting this table.
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  domain: text("domain").notNull(),
  entityId: text("entity_id"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  source: text("source").notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
