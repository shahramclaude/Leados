// LEADOS data model — Part 6: Strategy, Finance & Execution Command.
//
// This schema is intentionally additive and self-contained: it gives the
// strategy/finance/execution layer a durable home for OKRs, the financial
// operating system, the scenario & wargame studio, the decision workspace,
// execution command, and the early-warning indicator library. All derived
// numbers (status, confidence, distributions) are computed by the pure
// functions in `src/lib/**` from this data — nothing here stores a
// precomputed "fact" that should instead be recomputed from events/actuals.
import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Backbone: append-only event log. Every "reality check" (OKR status
// recompute, execution confidence, early-warning trend-break) ultimately
// replays from here rather than trusting a cached field.
// ---------------------------------------------------------------------------
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 255 }).notNull(),
  payload: jsonb("payload").notNull().default({}),
  subjectType: varchar("subject_type", { length: 100 }),
  subjectId: varchar("subject_id", { length: 100 }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// People (minimal — just enough for hiring-plan-driven burn projections).
// ---------------------------------------------------------------------------
export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 100 }).notNull(),
  team: varchar("team", { length: 255 }).notNull(),
  monthlySalary: doublePrecision("monthly_salary"),
  startDate: date("start_date"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const hiringPlanItems = pgTable("hiring_plan_items", {
  id: serial("id").primaryKey(),
  role: varchar("role", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 100 }).notNull(),
  team: varchar("team", { length: 255 }).notNull(),
  startMonth: date("start_month").notNull(),
  monthlyCostEstimate: doublePrecision("monthly_cost_estimate").notNull(),
  headcountDelta: integer("headcount_delta").notNull().default(1),
  scenarioTag: varchar("scenario_tag", { length: 100 }).notNull().default("base"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Part 6.1 — OKR cascade
// ---------------------------------------------------------------------------
export const okrObjectives = pgTable("okr_objectives", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  level: varchar("level", { length: 20 }).notNull().default("company"), // company | team | individual
  owner: varchar("owner", { length: 255 }).notNull(),
  parentId: integer("parent_id"),
  period: varchar("period", { length: 20 }).notNull(), // e.g. 2026-Q1
  weight: doublePrecision("weight").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const okrKeyResults = pgTable("okr_key_results", {
  id: serial("id").primaryKey(),
  objectiveId: integer("objective_id").notNull().references(() => okrObjectives.id),
  title: varchar("title", { length: 500 }).notNull(),
  metricKey: varchar("metric_key", { length: 150 }),
  startValue: doublePrecision("start_value").notNull().default(0),
  targetValue: doublePrecision("target_value").notNull().default(1),
  currentValue: doublePrecision("current_value").notNull().default(0),
  unit: varchar("unit", { length: 50 }).notNull().default("number"),
  weight: doublePrecision("weight").notNull().default(1),
  confidence: doublePrecision("confidence").notNull().default(0.6), // 0..1 self-reported
  checkInCadence: varchar("check_in_cadence", { length: 20 }).notNull().default("weekly"),
  lastCheckInAt: timestamp("last_check_in_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const okrInitiatives = pgTable("okr_initiatives", {
  id: serial("id").primaryKey(),
  keyResultId: integer("key_result_id").notNull().references(() => okrKeyResults.id),
  title: varchar("title", { length: 500 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("on_track"),
  contributionWeight: doublePrecision("contribution_weight").notNull().default(1),
  ownerId: integer("owner_id"),
  executionProjectId: integer("execution_project_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const okrCheckIns = pgTable("okr_check_ins", {
  id: serial("id").primaryKey(),
  keyResultId: integer("key_result_id").notNull().references(() => okrKeyResults.id),
  value: doublePrecision("value").notNull(),
  confidence: doublePrecision("confidence").notNull().default(0.6),
  note: text("note"),
  author: varchar("author", { length: 255 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Part 6.2 — Financial operating system
// ---------------------------------------------------------------------------
export const financeAssumptions = pgTable("finance_assumptions", {
  id: serial("id").primaryKey(),
  currentCashBalance: doublePrecision("current_cash_balance").notNull().default(1000000),
  baselineMonthlyRevenue: doublePrecision("baseline_monthly_revenue").notNull().default(50000),
  baselineRevenueGrowthRate: doublePrecision("baseline_revenue_growth_rate").notNull().default(0.03),
  grossMarginPct: doublePrecision("gross_margin_pct").notNull().default(0.72),
  covenantMinCashMonths: doublePrecision("covenant_min_cash_months").notNull().default(3),
  covenantMinCashBalance: doublePrecision("covenant_min_cash_balance").notNull().default(250000),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const financialEvents = pgTable("financial_events", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  type: varchar("type", { length: 30 }).notNull(), // revenue | expense | funding | pl_summary
  domain: varchar("domain", { length: 100 }),
  team: varchar("team", { length: 255 }),
  amount: doublePrecision("amount").notNull(),
  category: varchar("category", { length: 100 }).notNull().default("other"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const financialPlanLines = pgTable("financial_plan_lines", {
  id: serial("id").primaryKey(),
  periodMonth: date("period_month").notNull(),
  domain: varchar("domain", { length: 100 }),
  team: varchar("team", { length: 255 }),
  category: varchar("category", { length: 100 }).notNull().default("opex"),
  type: varchar("type", { length: 30 }).notNull().default("expense"), // revenue | expense
  plannedAmount: doublePrecision("planned_amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Part 6.3 — Scenario & wargame studio
// ---------------------------------------------------------------------------
export const scenarios = pgTable("scenarios", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  kind: varchar("kind", { length: 30 }).notNull().default("finance"), // finance | market | competitive
  assumptions: jsonb("assumptions").notNull().default({}),
  results: jsonb("results").notNull().default({}),
  earlyWarningIndicators: jsonb("early_warning_indicators").notNull().default([]),
  version: integer("version").notNull().default(1),
  parentScenarioId: integer("parent_scenario_id"),
  decisionId: integer("decision_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const wargames = pgTable("wargames", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  context: jsonb("context").notNull().default({}),
  ourStrategy: text("our_strategy").notNull().default(""),
  competitorProfiles: jsonb("competitor_profiles").notNull().default([]),
  rounds: jsonb("rounds").notNull().default([]),
  outcome: jsonb("outcome").notNull().default({}),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Part 6.4 — Decision intelligence workspace
// ---------------------------------------------------------------------------
export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  domain: varchar("domain", { length: 30 }).notNull().default("operations"),
  status: varchar("status", { length: 20 }).notNull().default("proposed"), // proposed|approved|rejected|deferred|executed
  context: text("context"),
  doorType: varchar("door_type", { length: 20 }).notNull().default("two_way"), // one_way | two_way
  impact: integer("impact").notNull().default(3), // 1..5
  deadline: date("deadline"),
  preMortem: jsonb("pre_mortem").notNull().default([]),
  chosenOptionId: integer("chosen_option_id"),
  retrospectiveScore: doublePrecision("retrospective_score"),
  retrospectiveNotes: text("retrospective_notes"),
  retrospectiveDueAt: timestamp("retrospective_due_at", { withTimezone: true }),
  scenarioId: integer("scenario_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const decisionCriteria = pgTable("decision_criteria", {
  id: serial("id").primaryKey(),
  decisionId: integer("decision_id").notNull().references(() => decisions.id),
  name: varchar("name", { length: 150 }).notNull(),
  weight: doublePrecision("weight").notNull().default(0.25),
});

export const decisionOptions = pgTable("decision_options", {
  id: serial("id").primaryKey(),
  decisionId: integer("decision_id").notNull().references(() => decisions.id),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  criteriaScores: jsonb("criteria_scores").notNull().default({}), // { [criterionName]: 0..1 }
  estimatedValue: doublePrecision("estimated_value").notNull().default(0),
  uncertaintyLow: doublePrecision("uncertainty_low").notNull().default(0),
  uncertaintyHigh: doublePrecision("uncertainty_high").notNull().default(0),
  probabilityOfSuccess: doublePrecision("probability_of_success").notNull().default(0.6),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Part 6.5 — Execution command
// ---------------------------------------------------------------------------
export const execProjects = pgTable("exec_projects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 500 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("active"), // active|at_risk|blocked|done
  startDate: date("start_date").notNull(),
  targetDate: date("target_date").notNull(),
  okrInitiativeId: integer("okr_initiative_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const execMilestones = pgTable("exec_milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => execProjects.id),
  title: varchar("title", { length: 500 }).notNull(),
  durationDays: integer("duration_days").notNull().default(5),
  durationP90Days: integer("duration_p90_days"), // optional pessimistic estimate for schedule-risk MC
  dependsOn: jsonb("depends_on").notNull().default([]), // array of milestone ids (within same project)
  dueDate: date("due_date"),
  status: varchar("status", { length: 20 }).notNull().default("not_started"), // not_started|in_progress|done|blocked
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const execBlockers = pgTable("exec_blockers", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => execProjects.id),
  milestoneId: integer("milestone_id"),
  title: varchar("title", { length: 500 }).notNull(),
  severity: varchar("severity", { length: 20 }).notNull().default("medium"), // low|medium|high|critical
  impactDays: integer("impact_days").notNull().default(0),
  raisedAt: timestamp("raised_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const execDependencies = pgTable("exec_dependencies", {
  id: serial("id").primaryKey(),
  upstreamProjectId: integer("upstream_project_id").notNull().references(() => execProjects.id),
  downstreamProjectId: integer("downstream_project_id").notNull().references(() => execProjects.id),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Part 6.7 — Strategic early-warning indicator library
// ---------------------------------------------------------------------------
export const indicators = pgTable("indicators", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 150 }).notNull().unique(),
  label: varchar("label", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 30 }).notNull().default("financial"), // market|delivery|people|financial
  unit: varchar("unit", { length: 50 }).notNull().default("number"),
  direction: varchar("direction", { length: 20 }).notNull().default("below_bad"), // above_bad|below_bad
  warningThreshold: doublePrecision("warning_threshold").notNull(),
  criticalThreshold: doublePrecision("critical_threshold").notNull(),
  linksToScenario: varchar("links_to_scenario", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const indicatorReadings = pgTable("indicator_readings", {
  id: serial("id").primaryKey(),
  indicatorKey: varchar("indicator_key", { length: 150 }).notNull(),
  value: doublePrecision("value").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Part 6.6 — Board packs (stored for determinism/testability + history)
// ---------------------------------------------------------------------------
export const boardPacks = pgTable("board_packs", {
  id: serial("id").primaryKey(),
  periodLabel: varchar("period_label", { length: 50 }).notNull(),
  markdown: text("markdown").notNull(),
  inputsSnapshot: jsonb("inputs_snapshot").notNull().default({}),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
});
