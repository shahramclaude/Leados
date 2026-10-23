import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  date,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Part 92 — GTM & Revenue Operations                                  */
/* ------------------------------------------------------------------ */
export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  account: text("account").notNull(),
  amountUsd: numeric("amount_usd", { precision: 14, scale: 2 }).notNull(),
  stage: text("stage").notNull(), // prospect|qualify|propose|negotiate|closed-won|closed-lost
  probability: numeric("probability", { precision: 5, scale: 4 }).notNull(), // model-derived
  closeDate: date("close_date").notNull(),
  owner: text("owner").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const revenueForecasts = pgTable("revenue_forecasts", {
  id: serial("id").primaryKey(),
  period: text("period").notNull(),
  method: text("method").notNull(), // deal-level|pipeline-coverage|ensemble
  p10: numeric("p10", { precision: 14, scale: 2 }).notNull(),
  p50: numeric("p50", { precision: 14, scale: 2 }).notNull(),
  p90: numeric("p90", { precision: 14, scale: 2 }).notNull(),
  honestyLabel: text("honesty_label").notNull().default("estimated"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Part 93 — Customer Success & Product Intelligence                   */
/* ------------------------------------------------------------------ */
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  segment: text("segment").notNull(),
  mrrUsd: numeric("mrr_usd", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const healthScores = pgTable("health_scores", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  score: numeric("score", { precision: 5, scale: 2 }).notNull(),
  band: text("band").notNull(), // healthy|watch|at-risk|critical
  adoption: numeric("adoption", { precision: 5, scale: 2 }).notNull(),
  engagement: numeric("engagement", { precision: 5, scale: 2 }).notNull(),
  support: numeric("support", { precision: 5, scale: 2 }).notNull(),
  outcome: numeric("outcome", { precision: 5, scale: 2 }).notNull(),
  explainTop3: jsonb("explain_top3").$type<string[]>().notNull(),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
});

export const churnWarnings = pgTable("churn_warnings", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  probability: numeric("probability", { precision: 5, scale: 4 }).notNull(),
  leadTimeDays: integer("lead_time_days").notNull(),
  driver: text("driver").notNull(),
  honestyLabel: text("honesty_label").notNull().default("association"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const voiceItems = pgTable("voice_items", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id),
  source: text("source").notNull(), // ticket|call|survey|review
  text: text("text").notNull(),
  topic: text("topic").notNull(),
  sentiment: numeric("sentiment", { precision: 4, scale: 3 }).notNull(), // -1..1
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Part 94 — Supply Chain & Operations Execution                       */
/* ------------------------------------------------------------------ */
export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  onHand: integer("on_hand").notNull(),
  reorderPoint: integer("reorder_point").notNull(),
  orderUpTo: integer("order_up_to").notNull(),
  leadTimeDays: integer("lead_time_days").notNull(),
  demandHistory: jsonb("demand_history").$type<number[]>().notNull(),
  pattern: text("pattern").notNull().default("steady"), // steady|intermittent|seasonal|volatile
});

export const demandForecasts = pgTable("demand_forecasts", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => inventoryItems.id),
  method: text("method").notNull(), // moving-average|croston-like|seasonal-naive
  p50: numeric("p50", { precision: 10, scale: 2 }).notNull(),
  p90: numeric("p90", { precision: 10, scale: 2 }).notNull(),
  biasPct: numeric("bias_pct", { precision: 6, scale: 3 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const qualityChecks = pgTable("quality_checks", {
  id: serial("id").primaryKey(),
  line: text("line").notNull(),
  metric: text("metric").notNull(),
  value: numeric("value", { precision: 10, scale: 3 }).notNull(),
  centerLine: numeric("center_line", { precision: 10, scale: 3 }).notNull(),
  upperLimit: numeric("upper_limit", { precision: 10, scale: 3 }).notNull(),
  lowerLimit: numeric("lower_limit", { precision: 10, scale: 3 }).notNull(),
  violation: boolean("violation").notNull().default(false),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Part 95 — Real-time Collaboration (decisions + review threads)      */
/* ------------------------------------------------------------------ */
export const decisionRecords = pgTable("decision_records", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  chosen: text("chosen").notNull(),
  rationale: text("rationale").notNull(),
  dissent: jsonb("dissent").$type<string[]>().notNull().default([]),
  reviewDate: date("review_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const commentThreads = pgTable("comment_threads", {
  id: serial("id").primaryKey(),
  docRef: text("doc_ref").notNull(),
  quotedText: text("quoted_text").notNull(),
  status: text("status").notNull().default("open"), // open|resolved|deferred
  participants: jsonb("participants").$type<string[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Part 96 — Context-aware omnichannel briefings                       */
/* ------------------------------------------------------------------ */
export const briefings = pgTable("briefings", {
  id: serial("id").primaryKey(),
  forUser: text("for_user").notNull(),
  trigger: text("trigger").notNull(), // morning|pre-meeting|weekly|crisis
  items: jsonb("items").$type<{ kind: string; content: string; priority: number }[]>().notNull(),
  readingTimeSec: integer("reading_time_sec").notNull(),
  channel: text("channel").notNull().default("mobile"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Part 97 — Trust & Explainability Center                             */
/* ------------------------------------------------------------------ */
export const metricRegistry = pgTable("metric_registry", {
  id: serial("id").primaryKey(),
  metricKey: text("metric_key").notNull().unique(),
  route: text("route").notNull(),
  formula: text("formula").notNull(),
  owner: text("owner").notNull(),
  honestyLabel: text("honesty_label").notNull(), // measured|estimated|association|effect
  lastReviewed: date("last_reviewed").notNull(),
});

export const modelCards = pgTable("model_cards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // ml|prompt|rubric|ruleset
  purpose: text("purpose").notNull(),
  trainingData: text("training_data").notNull(),
  knownLimits: text("known_limits").notNull(),
  owner: text("owner").notNull(),
  lastReviewed: date("last_reviewed").notNull(),
});

export const appeals = pgTable("appeals", {
  id: serial("id").primaryKey(),
  subjectRef: text("subject_ref").notNull(),
  challenger: text("challenger").notNull(),
  claim: text("claim").notNull(),
  status: text("status").notNull().default("open"), // open|upheld|overturned|partially
  resolution: text("resolution").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Part 98 — Extensibility Platform                                    */
/* ------------------------------------------------------------------ */
export const extensions = pgTable("extensions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // widget|integration|report|rule-pack|workflow-template
  capabilities: jsonb("capabilities").$type<string[]>().notNull(),
  verified: text("verified").notNull().default("none"), // none|security|security+quality
  installCount: integer("install_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Part 99 — Adoption & Learning Flywheel                               */
/* ------------------------------------------------------------------ */
export const onboardingMissions = pgTable("onboarding_missions", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(),
  objective: text("objective").notNull(),
  steps: jsonb("steps").$type<{ action: string; timeMin: number }[]>().notNull(),
  completionRatePct: numeric("completion_rate_pct", { precision: 5, scale: 2 }).notNull(),
});

export const adoptionFunnel = pgTable("adoption_funnel", {
  id: serial("id").primaryKey(),
  stage: text("stage").notNull(), // signed-up|activated|habitual|expanded|champion
  role: text("role").notNull(),
  n: integer("n").notNull(),
  conversionPct: numeric("conversion_pct", { precision: 5, scale: 2 }).notNull(),
  measuredAt: timestamp("measured_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Part 103 — FinOps & LLM cost governance                             */
/* ------------------------------------------------------------------ */
export const costRecords = pgTable("cost_records", {
  id: serial("id").primaryKey(),
  dimension: text("dimension").notNull(), // infra|llm|third-party
  resource: text("resource").notNull(),
  feature: text("feature").notNull(),
  amountUsd: numeric("amount_usd", { precision: 12, scale: 4 }).notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Part 102 — Observability & SLO automation                           */
/* ------------------------------------------------------------------ */
export const sloDefinitions = pgTable("slo_definitions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  indicator: text("indicator").notNull(), // availability|latency|accuracy|freshness|correctness
  targetPct: numeric("target_pct", { precision: 6, scale: 3 }).notNull(),
  windowDays: integer("window_days").notNull(),
  owner: text("owner").notNull(),
});

export const sloMeasurements = pgTable("slo_measurements", {
  id: serial("id").primaryKey(),
  sloId: integer("slo_id").notNull().references(() => sloDefinitions.id),
  measuredPct: numeric("measured_pct", { precision: 6, scale: 3 }).notNull(),
  measuredAt: timestamp("measured_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Part 105 — Security & supply-chain hardening                        */
/* ------------------------------------------------------------------ */
export const securityFindings = pgTable("security_findings", {
  id: serial("id").primaryKey(),
  severity: text("severity").notNull(), // critical|high|medium|low
  findingClass: text("finding_class").notNull(), // web|api|authz|ai-prompt-injection|ai-data-leak|supply-chain|infra
  description: text("description").notNull(),
  status: text("status").notNull().default("open"), // open|mitigated|accepted
  slaDays: integer("sla_days").notNull(),
  discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Part 106 — Privacy & compliance as code                             */
/* ------------------------------------------------------------------ */
export const privacyDataFields = pgTable("privacy_data_fields", {
  id: serial("id").primaryKey(),
  tableName: text("table_name").notNull(),
  fieldName: text("field_name").notNull(),
  category: text("category").notNull(), // identity|contact|behavior|sensitive|derived
  lawfulBasis: text("lawful_basis").notNull(),
  retentionDays: integer("retention_days").notNull(),
  deletionMode: text("deletion_mode").notNull(), // hard|anonymize|archive
});

export const dsarRequests = pgTable("dsar_requests", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // access|export|delete|rectify|restrict
  subjectRef: text("subject_ref").notNull(),
  status: text("status").notNull().default("received"), // received|in-progress|complete
  dueDate: date("due_date").notNull(),
  scope: jsonb("scope").$type<string[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Part 100/107 — Delivery gate ledger (program/capstone gate tracking)*/
/* ------------------------------------------------------------------ */
export const gateLedger = pgTable("gate_ledger", {
  id: serial("id").primaryKey(),
  part: integer("part").notNull(),
  gateId: text("gate_id").notNull(),
  statement: text("statement").notNull(),
  acceptThreshold: text("accept_threshold").notNull(),
  measuredValue: text("measured_value").notNull(),
  status: text("status").notNull(), // pass|fail|unknown|never-run
  dimension: text("dimension").notNull(), // intelligence|automation|trust|reliability|security|privacy|economics|design|universality
  measuredAt: timestamp("measured_at").defaultNow().notNull(),
});
