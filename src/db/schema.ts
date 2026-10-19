import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";

// These three tables back global entity search (⌘K) and the Understand/Act
// list views that benefit from being durable, query-able records rather than
// purely in-memory demo data (see src/lib/engine.ts for the rest of the
// simulated signal/metric layer, which is intentionally ephemeral/computed).

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  team: text("team").notNull(),
  tenureMonths: integer("tenure_months").notNull(),
  sentiment: real("sentiment").notNull(),
  engagement: real("engagement").notNull(),
  flightRisk: real("flight_risk").notNull(),
  lastCheckIn: timestamp("last_check_in", { withTimezone: true }).notNull(),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  owner: text("owner").notNull(),
  team: text("team").notNull(),
  status: text("status").notNull(),
  health: integer("health").notNull(),
  budgetUsed: integer("budget_used").notNull(),
  budgetTotal: integer("budget_total").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
});

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  owner: text("owner").notNull(),
  status: text("status").notNull(),
  severity: text("severity").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  description: text("description").notNull(),
});
