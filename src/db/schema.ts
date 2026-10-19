// =============================================================================
// LEADOS — Part 4: Autonomous Automation schema
// -----------------------------------------------------------------------------
// Provenance note: the upstream repo (github.com/shahramclaude/Leados) was
// cloned and read in full for this session. Its own src/db/schema.ts only
// defines 7 tables (beliefs, belief_observations, findings, calibration_runs,
// rule_weights, forecast_cache, scenarios) while ~40 route/lib files import
// tables that do not exist anywhere in that tree (agentCycles, autonomousRuns,
// leados_autonomous_runs, hypotheses, playbookInstances, notifications,
// settings, work_queue, people, rules, ...). That tree is a merged-but-
// unreconciled stack of independent "part" sessions (each one's own code
// comments admit "recreated for this sandbox" / "not present in this
// checkout"), so it does not compile as a unit. This session builds Part 4 —
// the autonomous orchestration kernel — fresh, self-consistently, against
// this working tree, reusing naming/concepts from the upstream repo
// (agent cycles, autonomous runs, playbook/finding domain, work queue,
// self-improvement, briefings) wherever they map cleanly onto a single
// coherent schema. See AI-SESSION-LOG.md for the full provenance record.
// =============================================================================

import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// -----------------------------------------------------------------------------
// Domain: findings & metrics (what the agent observes)
// -----------------------------------------------------------------------------

export const findings = pgTable(
  "findings",
  {
    id: serial("id").primaryKey(),
    domain: text("domain").notNull(), // e.g. "people", "financial", "execution"
    severity: integer("severity").notNull(), // 1-5, 5 = critical
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("open"), // open | resolved
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("findings_status_idx").on(t.status), index("findings_severity_idx").on(t.severity)],
);

export const metricReadings = pgTable(
  "metric_readings",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    value: doublePrecision("value").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("metric_readings_key_idx").on(t.key)],
);

export const rules = pgTable("rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  weight: doublePrecision("weight").notNull().default(1),
  threshold: doublePrecision("threshold").notNull().default(0.5),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------------------------------------------------------------
// Capability registry (admin overrides over the code-defined registry)
// -----------------------------------------------------------------------------

export const capabilityOverrides = pgTable("capability_overrides", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  mode: text("mode"), // auto | ask-once | manual — null = use code default
  dailyBudget: integer("daily_budget"), // null = use code default
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

// -----------------------------------------------------------------------------
// Orchestration kernel — event-sourced runs
// -----------------------------------------------------------------------------

export const kernelRuns = pgTable(
  "kernel_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    triggerType: text("trigger_type").notNull(), // cron | event | manual
    triggerSource: text("trigger_source").notNull(),
    dryRun: boolean("dry_run").notNull().default(false),
    status: text("status").notNull().default("running"), // running | completed | failed | paused_budget
    planSummary: text("plan_summary"),
    outcome: jsonb("outcome").$type<Record<string, unknown>>(),
    rollbackPoints: jsonb("rollback_points").$type<string[]>().default([]),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: text("created_by").notNull().default("system"),
  },
  (t) => [index("kernel_runs_started_idx").on(t.startedAt)],
);

export const kernelSteps = pgTable(
  "kernel_steps",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: bigserial("run_id", { mode: "number" }).notNull(),
    stepIndex: integer("step_index").notNull(),
    phase: text("phase").notNull(), // observe|orient|hypothesize|plan|act|verify|learn
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("ok"), // ok | error
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("kernel_steps_run_idx").on(t.runId)],
);

export const kernelToolCalls = pgTable(
  "kernel_tool_calls",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: bigserial("run_id", { mode: "number" }).notNull(),
    capabilityKey: text("capability_key").notNull(),
    params: jsonb("params").$type<Record<string, unknown>>(),
    riskClass: text("risk_class").notNull(), // low | medium | high
    mode: text("mode").notNull(), // auto | ask-once | manual
    dryRun: boolean("dry_run").notNull().default(false),
    status: text("status").notNull().default("pending"),
    // pending | approved | rejected | executed | failed | skipped_budget | skipped_disabled
    costEstimate: doublePrecision("cost_estimate").notNull().default(0),
    predictedDiff: jsonb("predicted_diff").$type<Record<string, unknown>>(),
    actualResult: jsonb("actual_result").$type<Record<string, unknown>>(),
    undoHandle: text("undo_handle"),
    undone: boolean("undone").notNull().default(false),
    approvalId: bigserial("approval_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
  },
  (t) => [index("kernel_tool_calls_run_idx").on(t.runId), index("kernel_tool_calls_status_idx").on(t.status)],
);

// -----------------------------------------------------------------------------
// Approvals (human-in-the-loop gate)
// -----------------------------------------------------------------------------

export const approvals = pgTable(
  "approvals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    toolCallId: bigserial("tool_call_id", { mode: "number" }).notNull(),
    riskClass: text("risk_class").notNull(),
    summary: text("summary").notNull(),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    reason: text("reason"),
  },
  (t) => [index("approvals_status_idx").on(t.status)],
);

// -----------------------------------------------------------------------------
// Scheduler — jobs, runs, dead letter queue
// -----------------------------------------------------------------------------

export const jobs = pgTable("jobs", {
  key: text("key").primaryKey(),
  kind: text("kind").notNull(), // cron | event | manual
  cronExpr: text("cron_expr"),
  eventType: text("event_type"),
  dependsOn: jsonb("depends_on").$type<string[]>().default([]),
  concurrencyLimit: integer("concurrency_limit").notNull().default(1),
  timeoutMs: integer("timeout_ms").notNull().default(60000),
  maxRetries: integer("max_retries").notNull().default(3),
  backoffBaseMs: integer("backoff_base_ms").notNull().default(1000),
  enabled: boolean("enabled").notNull().default(true),
});

export const jobRuns = pgTable(
  "job_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    jobKey: text("job_key").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("queued"),
    // queued | running | succeeded | failed | dead_letter
    attempt: integer("attempt").notNull().default(1),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    jitterMs: integer("jitter_ms").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    kernelRunId: bigserial("kernel_run_id", { mode: "number" }),
  },
  (t) => [
    uniqueIndex("job_runs_idempotency_idx").on(t.idempotencyKey),
    index("job_runs_job_key_idx").on(t.jobKey),
  ],
);

export const deadLetterQueue = pgTable("dead_letter_queue", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  jobRunId: bigserial("job_run_id", { mode: "number" }).notNull(),
  jobKey: text("job_key").notNull(),
  reason: text("reason").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  resolution: text("resolution"), // requeued | dismissed
});

// -----------------------------------------------------------------------------
// Work queue — proposed tasks with a status machine
// -----------------------------------------------------------------------------

export const workItems = pgTable(
  "work_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    domain: text("domain").notNull(),
    proposedBy: text("proposed_by").notNull(), // "agent" | human name
    assignee: text("assignee"),
    status: text("status").notNull().default("proposed"),
    // proposed | approved | running | verifying | done | reverted | rejected
    riskClass: text("risk_class").notNull().default("low"),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    kernelRunId: bigserial("kernel_run_id", { mode: "number" }),
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("work_items_status_idx").on(t.status)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    severity: text("severity").notNull().default("info"), // info | warn | critical
    linkedWorkItemId: bigserial("linked_work_item_id", { mode: "number" }),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_read_idx").on(t.read)],
);

// -----------------------------------------------------------------------------
// Immutable audit log
// -----------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actor: text("actor").notNull(), // "agent:kernel" | "human:<name>"
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    reason: text("reason").notNull(),
    riskClass: text("risk_class").notNull().default("low"),
    rollbackHandle: text("rollback_handle"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt)],
);

// -----------------------------------------------------------------------------
// Budgets (per-domain daily write budget)
// -----------------------------------------------------------------------------

export const actionBudgets = pgTable(
  "action_budgets",
  {
    id: serial("id").primaryKey(),
    domain: text("domain").notNull(),
    dateKey: text("date_key").notNull(), // YYYY-MM-DD (UTC)
    maxWrites: integer("max_writes").notNull().default(20),
    usedWrites: integer("used_writes").notNull().default(0),
  },
  (t) => [uniqueIndex("action_budgets_domain_date_idx").on(t.domain, t.dateKey)],
);

// -----------------------------------------------------------------------------
// Global autonomy settings (kill switch, singleton row id=1)
// -----------------------------------------------------------------------------

export const autonomySettings = pgTable("autonomy_settings", {
  id: integer("id").primaryKey().default(1),
  paused: boolean("paused").notNull().default(false),
  pausedReason: text("paused_reason"),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  anomalyTripwireActive: boolean("anomaly_tripwire_active").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------------------------------------------------------------
// Self-improvement proposals (safe, approval-gated)
// -----------------------------------------------------------------------------

export const goldenDatasetCases = pgTable("golden_dataset_cases", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  input: jsonb("input").$type<Record<string, unknown>>().notNull(),
  expectedSeverityAtLeast: integer("expected_severity_at_least"),
  expectedOutcome: boolean("expected_outcome").notNull(), // should this input fire a finding/rule?
});

export const selfImproveProposals = pgTable(
  "self_improve_proposals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    proposedBy: text("proposed_by").notNull().default("agent:kernel"),
    kind: text("kind").notNull(), // rule_weight | rule_threshold | prompt
    targetRuleId: integer("target_rule_id"),
    beforeValue: jsonb("before_value").$type<Record<string, unknown>>().notNull(),
    afterValue: jsonb("after_value").$type<Record<string, unknown>>().notNull(),
    rationale: text("rationale").notNull(),
    scorecard: jsonb("scorecard").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("proposed"),
    // proposed | evaluating | approved | rejected | merged
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("self_improve_status_idx").on(t.status)],
);

// -----------------------------------------------------------------------------
// Briefings
// -----------------------------------------------------------------------------

export const briefings = pgTable("briefings", {
  id: serial("id").primaryKey(),
  forDate: text("for_date").notNull(), // YYYY-MM-DD
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});
