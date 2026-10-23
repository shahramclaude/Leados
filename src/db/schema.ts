// LEADOS — Autonomous Executive Agent Kernel (Part 58) schema.
// Durable provenance tables: agent_runs, plan_nodes, step_records,
// policy_decisions, approvals, idempotency_keys.
import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
  boolean,
  serial,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  objective: text("objective").notNull(),
  planId: text("plan_id").notNull(),
  status: text("status").notNull().default("queued"),
  // queued | planning | running | awaiting_approval | critic_review | replanning
  // | success | partial | aborted | failed
  budgetUsd: numeric("budget_usd", { precision: 10, scale: 4 }).notNull(),
  budgetMin: integer("budget_min").notNull(),
  totalCostUsd: numeric("total_cost_usd", { precision: 10, scale: 4 })
    .notNull()
    .default("0"),
  totalMin: numeric("total_min", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  seed: text("seed").notNull(),
  modelVersion: text("model_version").notNull().default("planner-v1"),
  promptHash: text("prompt_hash").notNull(),
  requestedBy: text("requested_by").notNull(),
  replanCount: integer("replan_count").notNull().default(0),
  verdict: text("verdict"),
  replayHash: text("replay_hash"),
  criticScore: numeric("critic_score", { precision: 4, scale: 2 }),
  criticFeedback: jsonb("critic_feedback"),
  planGraph: jsonb("plan_graph").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const planNodes = pgTable(
  "plan_nodes",
  {
    id: serial("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    kind: text("kind").notNull(), // act | ask | verify | compensate
    goal: text("goal").notNull(),
    tool: text("tool").notNull(),
    inputSchema: text("input_schema").notNull(),
    estCostUsd: numeric("est_cost_usd", { precision: 10, scale: 4 }).notNull(),
    estMin: numeric("est_min", { precision: 10, scale: 2 }).notNull(),
    riskTier: integer("risk_tier").notNull(),
    dependsOn: jsonb("depends_on").notNull(),
    successCriteria: jsonb("success_criteria").notNull(),
    compensationNodeId: text("compensation_node_id"),
    status: text("status").notNull().default("pending"),
    // pending | running | done | failed | skipped | compensated | denied
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plan_nodes_run_node_uidx").on(t.runId, t.nodeId)]
);

export const stepRecords = pgTable("step_records", {
  id: serial("id").primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(),
  attempt: integer("attempt").notNull().default(1),
  toolId: text("tool_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  inputHash: text("input_hash").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
  outcome: text("outcome").notNull(), // success | failure | denied | skipped | compensated
  outputSummary: text("output_summary"),
  policyDecisionId: integer("policy_decision_id"),
  error: text("error"),
  seedUsed: text("seed_used").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const policyDecisions = pgTable("policy_decisions", {
  id: serial("id").primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(),
  toolId: text("tool_id").notNull(),
  riskTier: integer("risk_tier").notNull(),
  allow: boolean("allow").notNull(),
  reasons: jsonb("reasons").notNull(),
  requiresApprovalFrom: jsonb("requires_approval_from"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: serial("id").primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(),
  policyDecisionId: integer("policy_decision_id").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("pending"),
  // pending | approved | rejected | attention_failed
  reason: text("reason"),
  reviewer: text("reviewer"),
  attentionRequired: boolean("attention_required").notNull().default(false),
  attentionNonce: text("attention_nonce"),
  reasonQualityScore: numeric("reason_quality_score", { precision: 4, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const planRejections = pgTable("plan_rejections", {
  id: serial("id").primaryKey(),
  objective: text("objective").notNull(),
  errors: jsonb("errors").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const toolEffects = pgTable("tool_effects", {
  id: serial("id").primaryKey(),
  runId: uuid("run_id").notNull(),
  nodeId: text("node_id").notNull(),
  toolId: text("tool_id").notNull(),
  action: text("action").notNull(), // e.g. create | retract | reverse
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    runId: uuid("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    resultHash: text("result_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("idempotency_keys_key_uidx").on(t.key)]
);
