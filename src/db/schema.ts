// LEADOS — Part 07: Orchestration Kernel schema.
//
// Read-before-write note: the upstream https://github.com/shahramclaude/Leados
// repository was cloned and inspected before this file was written. It contains
// a `src/lib/kernel/*` subsystem with similar intent, but its own `src/db/schema.ts`
// does not define the tables those files import (`outbox`, `kernelRuns`,
// `kernelSteps`, etc.), and `npx tsc --noEmit` against that checkout fails before
// any of this part's work even starts. That tree is not internally consistent
// enough to build on safely (see AI-SESSION-LOG.md for the full discrepancy
// report). This schema is therefore authored fresh against this session's actual
// sandbox (a blank Next.js + Drizzle + Postgres starter), reusing the upstream
// naming conventions (`src/lib/kernel/**`) for continuity wherever they are sane.
//
// Everything below is one coherent, self-consistent schema backing:
//  - Part 01-equivalent minimum: an append-only event envelope + outbox.
//  - Part 04-equivalent minimum: severity-scored findings or a tripwire policy.
//  - Part 07: the orchestration kernel itself (runs/steps/approvals/budgets/
//    work queue/self-improvement/scheduler).
import {
  bigserial,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Part 01 (minimal, reconstructed): append-only event envelope + outbox.
// ---------------------------------------------------------------------------

export const kernelEvents = pgTable("kernel_events", {
  id: text("id").primaryKey(),
  seq: bigserial("seq", { mode: "number" }).notNull(),
  type: text("type").notNull(),
  actorKind: text("actor_kind").notNull(), // "agent" | "human" | "system"
  actorId: text("actor_id").notNull(),
  correlationId: text("correlation_id").notNull(), // runId
  causationId: text("causation_id"),
  payload: jsonb("payload").notNull(),
  policyVersion: text("policy_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kernelOutbox = pgTable("kernel_outbox", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  topic: text("topic").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"), // pending | sent | failed
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Part 04 (minimal, reconstructed): severity-scored findings + interrupt policy.
// ---------------------------------------------------------------------------

export const kernelFindings = pgTable("kernel_findings", {
  id: text("id").primaryKey(),
  severity: integer("severity").notNull(), // 1 (info) .. 5 (critical)
  title: text("title").notNull(),
  description: text("description").notNull(),
  domain: text("domain").notNull(),
  status: text("status").notNull().default("open"), // open | acknowledged | resolved
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kernelMetricReadings = pgTable("kernel_metric_readings", {
  id: text("id").primaryKey(),
  metricKey: text("metric_key").notNull(),
  value: doublePrecision("value").notNull(),
  baseline: doublePrecision("baseline").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Policy engine: versioned policy data + per-capability auto-mode overrides.
// ---------------------------------------------------------------------------

export const kernelPolicyVersions = pgTable("kernel_policy_versions", {
  id: text("id").primaryKey(), // e.g. "v1"
  version: integer("version").notNull(),
  rules: jsonb("rules").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kernelCapabilityOverrides = pgTable("kernel_capability_overrides", {
  id: text("id").primaryKey(),
  capability: text("capability").notNull().unique(),
  mode: text("mode").notNull().default("ask"), // "auto" | "ask" | "manual"
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const kernelDelegations = pgTable("kernel_delegations", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(), // capability name OR "risk:<riskClass>"
  mode: text("mode").notNull().default("auto"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const kernelActiveRules = pgTable("kernel_active_rules", {
  ruleKey: text("rule_key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByProposalId: text("updated_by_proposal_id"),
});

// ---------------------------------------------------------------------------
// Orchestration kernel: runs, steps, dry-run records, locks.
// ---------------------------------------------------------------------------

export const kernelRuns = pgTable("kernel_runs", {
  id: text("id").primaryKey(), // planId
  goal: text("goal").notNull(),
  domain: text("domain").notNull(),
  planType: text("plan_type").notNull(),
  status: text("status").notNull().default("pending"),
  // pending | running | awaiting_approval | verifying | done | failed | reverted | halted
  dryRun: boolean("dry_run").notNull().default(true),
  budget: jsonb("budget").notNull(),
  policyVersion: text("policy_version").notNull(),
  checkpoint: integer("checkpoint").notNull().default(0),
  haltedReason: text("halted_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const kernelSteps = pgTable(
  "kernel_steps",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    idx: integer("idx").notNull(),
    kind: text("kind").notNull(), // StepKind
    capability: text("capability").notNull(),
    input: jsonb("input").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    compensation: jsonb("compensation"),
    risk: text("risk").notNull(), // read | low | medium | high
    status: text("status").notNull().default("pending"),
    output: jsonb("output"),
    predictedDiff: jsonb("predicted_diff"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    entityKey: text("entity_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("kernel_steps_idempotency_key_uq").on(t.idempotencyKey)],
);

export const kernelPlanTypeDryRuns = pgTable("kernel_plan_type_dry_runs", {
  planType: text("plan_type").primaryKey(),
  dryRunRunId: text("dry_run_run_id").notNull(),
  dryRunAt: timestamp("dry_run_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kernelLocks = pgTable("kernel_locks", {
  entityKey: text("entity_key").primaryKey(),
  runId: text("run_id").notNull(),
  acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// ---------------------------------------------------------------------------
// Human-in-the-loop: approvals.
// ---------------------------------------------------------------------------

export const kernelApprovals = pgTable("kernel_approvals", {
  id: text("id").primaryKey(),
  stepId: text("step_id").notNull(),
  runId: text("run_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | modified
  riskClass: text("risk_class").notNull(),
  predictedDiff: jsonb("predicted_diff"),
  evidence: jsonb("evidence"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: text("decided_by"),
  decisionNote: text("decision_note"),
  modifiedInput: jsonb("modified_input"),
});

// ---------------------------------------------------------------------------
// Budgets, circuit breakers, dead-letter queue.
// ---------------------------------------------------------------------------

export const kernelBudgets = pgTable(
  "kernel_budgets",
  {
    id: text("id").primaryKey(),
    domain: text("domain").notNull(),
    capability: text("capability").notNull(),
    day: text("day").notNull(), // YYYY-MM-DD
    limitAmount: integer("limit_amount").notNull(),
    consumed: integer("consumed").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("kernel_budgets_domain_cap_day_uq").on(t.domain, t.capability, t.day)],
);

export const kernelCircuitBreakers = pgTable("kernel_circuit_breakers", {
  capability: text("capability").primaryKey(),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  trippedAt: timestamp("tripped_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kernelDeadLetters = pgTable("kernel_dead_letters", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  stepId: text("step_id").notNull(),
  reason: text("reason").notNull(),
  payload: jsonb("payload").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kernelKillSwitch = pgTable("kernel_kill_switch", {
  id: text("id").primaryKey().default("global"),
  engaged: boolean("engaged").notNull().default(false),
  engagedAt: timestamp("engaged_at", { withTimezone: true }),
  engagedBy: text("engaged_by"),
  reason: text("reason"),
});

export const kernelDomainPauses = pgTable("kernel_domain_pauses", {
  domain: text("domain").primaryKey(),
  paused: boolean("paused").notNull().default(false),
  reason: text("reason"),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Work queue (shared task system for humans + agents).
// ---------------------------------------------------------------------------

export const kernelWorkItems = pgTable("kernel_work_items", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("proposed"),
  // proposed | approved | running | verifying | done | reverted | dead-lettered
  assigneeKind: text("assignee_kind"), // "human" | "agent"
  assigneeId: text("assignee_id"),
  runId: text("run_id"),
  stepId: text("step_id"),
  slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
  escalated: boolean("escalated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Self-improvement, caged.
// ---------------------------------------------------------------------------

export const kernelGoldenCases = pgTable("kernel_golden_cases", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ruleKey: text("rule_key").notNull(),
  input: jsonb("input").notNull(),
  expected: jsonb("expected").notNull(),
});

export const kernelSelfImproveProposals = pgTable("kernel_self_improve_proposals", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // "rule" | "threshold" | "prompt"
  ruleKey: text("rule_key").notNull(),
  title: text("title").notNull(),
  rationale: text("rationale").notNull(),
  before: jsonb("before").notNull(),
  after: jsonb("after").notNull(),
  scorecard: jsonb("scorecard"),
  status: text("status").notNull().default("proposed"),
  // proposed | evaluated | approved | rejected | merged
  proposedBy: jsonb("proposed_by").notNull(),
  decidedBy: jsonb("decided_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  mergedAt: timestamp("merged_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Scheduler: jobs + job runs.
// ---------------------------------------------------------------------------

export const kernelJobs = pgTable("kernel_jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  trigger: jsonb("trigger").notNull(),
  handler: text("handler").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kernelJobRuns = pgTable("kernel_job_runs", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text("status").notNull().default("running"), // running | done | failed | skipped
  error: text("error"),
  resultingRunId: text("resulting_run_id"),
});
