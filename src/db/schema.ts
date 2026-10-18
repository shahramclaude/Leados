// ============================================================================
// LEADOS — Schema (initial creation, Part 10 integration pass)
//
// Migration DDL (apply with `npx drizzle-kit push` against a fresh DB, or run
// the statements below by hand against an existing one):
//
// CREATE TABLE people (
//   id serial PRIMARY KEY,
//   name text NOT NULL,
//   email text,
//   role text NOT NULL,
//   team text NOT NULL,
//   manager_id integer REFERENCES people(id),
//   start_date timestamp NOT NULL DEFAULT now(),
//   status text NOT NULL DEFAULT 'active',
//   last_one_on_one_at timestamp
// );
// CREATE TABLE one_on_ones (
//   id serial PRIMARY KEY,
//   person_id integer NOT NULL REFERENCES people(id),
//   occurred_at timestamp NOT NULL DEFAULT now(),
//   notes text NOT NULL DEFAULT '',
//   sentiment integer NOT NULL DEFAULT 0,
//   action_items jsonb NOT NULL DEFAULT '[]',
//   next_due_at timestamp
// );
// CREATE TABLE decisions (
//   id serial PRIMARY KEY,
//   title text NOT NULL,
//   description text NOT NULL DEFAULT '',
//   owner text NOT NULL,
//   domain text NOT NULL,
//   status text NOT NULL DEFAULT 'proposed',
//   deadline timestamp,
//   created_at timestamp NOT NULL DEFAULT now(),
//   decided_at timestamp,
//   confidence integer NOT NULL DEFAULT 50,
//   outcome_success boolean,
//   impact integer NOT NULL DEFAULT 3
// );
// CREATE TABLE metric_defs (
//   id serial PRIMARY KEY,
//   key text NOT NULL UNIQUE,
//   label text NOT NULL,
//   domain text NOT NULL,
//   unit text NOT NULL DEFAULT '',
//   target numeric NOT NULL DEFAULT 0,
//   benchmark numeric NOT NULL DEFAULT 0,
//   direction text NOT NULL DEFAULT 'higher_better'
// );
// CREATE TABLE metric_values (
//   id serial PRIMARY KEY,
//   metric_key text NOT NULL REFERENCES metric_defs(key),
//   value numeric NOT NULL,
//   recorded_at timestamp NOT NULL DEFAULT now()
// );
// CREATE TABLE events (
//   id serial PRIMARY KEY,
//   type text NOT NULL,
//   domain text NOT NULL,
//   severity integer NOT NULL DEFAULT 1,
//   title text NOT NULL,
//   description text NOT NULL DEFAULT '',
//   created_at timestamp NOT NULL DEFAULT now(),
//   status text NOT NULL DEFAULT 'open',
//   source text NOT NULL DEFAULT 'manual'
// );
// CREATE TABLE notifications (
//   id serial PRIMARY KEY,
//   title text NOT NULL,
//   message text NOT NULL,
//   severity integer NOT NULL DEFAULT 1,
//   domain text NOT NULL,
//   read boolean NOT NULL DEFAULT false,
//   created_at timestamp NOT NULL DEFAULT now(),
//   link text
// );
// CREATE TABLE rules (
//   id serial PRIMARY KEY,
//   key text NOT NULL UNIQUE,
//   name text NOT NULL,
//   domain text NOT NULL,
//   weight numeric NOT NULL DEFAULT 1,
//   enabled boolean NOT NULL DEFAULT true,
//   description text NOT NULL DEFAULT ''
// );
// CREATE TABLE rule_evaluations (
//   id serial PRIMARY KEY,
//   rule_key text NOT NULL REFERENCES rules(key),
//   status text NOT NULL DEFAULT 'healthy',
//   score numeric NOT NULL DEFAULT 100,
//   evaluated_at timestamp NOT NULL DEFAULT now(),
//   detail text NOT NULL DEFAULT ''
// );
// CREATE TABLE playbooks (
//   id serial PRIMARY KEY,
//   name text NOT NULL,
//   description text NOT NULL DEFAULT '',
//   domain text NOT NULL,
//   due_date timestamp,
//   status text NOT NULL DEFAULT 'pending',
//   steps jsonb NOT NULL DEFAULT '[]'
// );
// CREATE TABLE insights (
//   id serial PRIMARY KEY,
//   title text NOT NULL,
//   body text NOT NULL,
//   domain text NOT NULL,
//   tags jsonb NOT NULL DEFAULT '[]',
//   created_at timestamp NOT NULL DEFAULT now()
// );
// CREATE TABLE scenarios (
//   id serial PRIMARY KEY,
//   name text NOT NULL,
//   assumptions jsonb NOT NULL DEFAULT '{}',
//   results jsonb NOT NULL DEFAULT '{}',
//   created_at timestamp NOT NULL DEFAULT now()
// );
// CREATE TABLE settings (
//   id integer PRIMARY KEY DEFAULT 1,
//   org_name text NOT NULL DEFAULT 'Acme Inc',
//   industry text NOT NULL DEFAULT 'saas',
//   stage text NOT NULL DEFAULT 'series-a',
//   team_size integer NOT NULL DEFAULT 25,
//   notification_prefs jsonb NOT NULL DEFAULT '{}',
//   autonomous_enabled boolean NOT NULL DEFAULT true,
//   autonomous_interval_minutes integer NOT NULL DEFAULT 30,
//   last_run_at timestamp,
//   updated_at timestamp NOT NULL DEFAULT now()
// );
// CREATE TABLE autonomous_runs (
//   id serial PRIMARY KEY,
//   started_at timestamp NOT NULL DEFAULT now(),
//   finished_at timestamp,
//   status text NOT NULL DEFAULT 'running',
//   summary text NOT NULL DEFAULT '',
//   findings_count integer NOT NULL DEFAULT 0
// );
// ============================================================================

import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

export type NotificationPrefs = Record<
  string,
  { enabled: boolean; minSeverity: number }
>;

export type QuietHours = { start: string; end: string };

export type PlaybookStep = { text: string; done: boolean };

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  role: text("role").notNull(),
  team: text("team").notNull(),
  managerId: integer("manager_id"),
  startDate: timestamp("start_date").notNull().defaultNow(),
  status: text("status").notNull().default("active"),
  lastOneOnOneAt: timestamp("last_one_on_one_at"),
});

export const oneOnOnes = pgTable("one_on_ones", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").notNull(),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  notes: text("notes").notNull().default(""),
  sentiment: integer("sentiment").notNull().default(0),
  actionItems: jsonb("action_items").$type<string[]>().notNull().default([]),
  nextDueAt: timestamp("next_due_at"),
});

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  owner: text("owner").notNull(),
  domain: text("domain").notNull(),
  status: text("status").notNull().default("proposed"),
  deadline: timestamp("deadline"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
  confidence: integer("confidence").notNull().default(50),
  outcomeSuccess: boolean("outcome_success"),
  impact: integer("impact").notNull().default(3),
});

export const metricDefs = pgTable("metric_defs", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  domain: text("domain").notNull(),
  unit: text("unit").notNull().default(""),
  target: numeric("target").notNull().default("0"),
  benchmark: numeric("benchmark").notNull().default("0"),
  direction: text("direction").notNull().default("higher_better"),
});

export const metricValues = pgTable("metric_values", {
  id: serial("id").primaryKey(),
  metricKey: text("metric_key").notNull(),
  value: numeric("value").notNull(),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  domain: text("domain").notNull(),
  severity: integer("severity").notNull().default(1),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  status: text("status").notNull().default("open"),
  source: text("source").notNull().default("manual"),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  severity: integer("severity").notNull().default(1),
  domain: text("domain").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  link: text("link"),
});

export const rules = pgTable("rules", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  weight: numeric("weight").notNull().default("1"),
  enabled: boolean("enabled").notNull().default(true),
  description: text("description").notNull().default(""),
});

export const ruleEvaluations = pgTable("rule_evaluations", {
  id: serial("id").primaryKey(),
  ruleKey: text("rule_key").notNull(),
  status: text("status").notNull().default("healthy"),
  score: numeric("score").notNull().default("100"),
  evaluatedAt: timestamp("evaluated_at").notNull().defaultNow(),
  detail: text("detail").notNull().default(""),
});

export const playbooks = pgTable("playbooks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  domain: text("domain").notNull(),
  dueDate: timestamp("due_date"),
  status: text("status").notNull().default("pending"),
  steps: jsonb("steps").$type<PlaybookStep[]>().notNull().default([]),
});

export const insights = pgTable("insights", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  domain: text("domain").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const scenarios = pgTable("scenarios", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  assumptions: jsonb("assumptions").$type<Record<string, number>>().notNull().default({}),
  results: jsonb("results").$type<Record<string, number>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  orgName: text("org_name").notNull().default("Acme Inc"),
  industry: text("industry").notNull().default("saas"),
  stage: text("stage").notNull().default("series-a"),
  teamSize: integer("team_size").notNull().default(25),
  notificationPrefs: jsonb("notification_prefs").$type<NotificationPrefs>().notNull().default({}),
  autonomousEnabled: boolean("autonomous_enabled").notNull().default(true),
  autonomousIntervalMinutes: integer("autonomous_interval_minutes").notNull().default(30),
  lastRunAt: timestamp("last_run_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const autonomousRuns = pgTable("autonomous_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  status: text("status").notNull().default("running"),
  summary: text("summary").notNull().default(""),
  findingsCount: integer("findings_count").notNull().default(0),
});
