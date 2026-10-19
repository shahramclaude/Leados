import { pgTable, text, real, boolean, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { randomUUID } from "crypto";

export const people = pgTable("people", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  role: text("role").notNull(),
  team: text("team").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  personId: text("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  weight: real("weight").notNull().default(1),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oneOnOnes = pgTable("one_on_ones", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  personId: text("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  actionItemsTotal: integer("action_items_total").notNull().default(0),
  actionItemsCompleted: integer("action_items_completed").notNull().default(0),
});

export const decisions = pgTable("decisions", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  status: text("status").notNull().default("open"),
  sev: integer("sev").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scenarios = pgTable("scenarios", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  status: text("status").notNull().default("active"),
  sev: integer("sev").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  dependsOn: jsonb("depends_on").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const milestones = pgTable("milestones", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  completed: boolean("completed").notNull().default(false),
});

export const blockers = pgTable("blockers", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  status: text("status").notNull().default("open"),
  sev: integer("sev").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hypotheses = pgTable("hypotheses", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  personId: text("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  sev: integer("sev").notNull().default(3),
  status: text("status").notNull().default("open"),
  dedupeKey: text("dedupe_key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const okrs = pgTable("okrs", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  progress: real("progress").notNull().default(0),
  timeElapsed: real("time_elapsed").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  domain: text("domain").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  sev: integer("sev").notNull().default(3),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const financeSnapshots = pgTable("finance_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  startingCash: real("starting_cash").notNull(),
  monthlyBurn: real("monthly_burn").notNull(),
  burnStdDev: real("burn_std_dev").notNull(),
  monthlyRevenue: real("monthly_revenue").notNull(),
  revenueGrowthRate: real("revenue_growth_rate").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
