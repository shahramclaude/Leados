// LEADOS Agent Kernel — literal type contracts (Part 58, PHASE 1).
// Every AI-produced plan is validated against these zod schemas before
// any node executes. Invalid plan = rejected, logged, counted (see validate.ts).
import { z } from "zod";

// ---------------------------------------------------------------------------
// Risk tiers
// T0 read-only · T1 idempotent-write (internal, replayable) · T2 write
// (internal, non-idempotent side effect) · T3 sensitive write requiring human
// approval · T4 irreversible / external (requires approval + cannot compensate
// cleanly).
// ---------------------------------------------------------------------------
export const RiskTierSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type RiskTier = z.infer<typeof RiskTierSchema>;

export const TOOL_IDS = [
  "metrics.read",
  "report.draft",
  "task.create",
  "budget.reallocate",
  "policy.draft",
  "email.send",
  "data.export",
  "migration.run",
] as const;
export const ToolIdSchema = z.enum(TOOL_IDS);
export type ToolId = z.infer<typeof ToolIdSchema>;

export const CriterionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  check: z.enum(["automatic", "rubric"]),
  threshold: z.number().min(0).max(5).optional(),
});
export type Criterion = z.infer<typeof CriterionSchema>;

// PlanNode is recursive (compensation: PlanNode) — defined with z.lazy().
export interface PlanNode {
  id: string;
  kind: "act" | "ask" | "verify" | "compensate";
  goal: string;
  tool: ToolId;
  inputSchema: string;
  input: Record<string, unknown>;
  estCostUsd: number;
  estMin: number;
  riskTier: RiskTier;
  dependsOn: string[];
  successCriteria: Criterion[];
  compensation?: PlanNode;
}

export const PlanNodeSchema: z.ZodType<PlanNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    kind: z.enum(["act", "ask", "verify", "compensate"]),
    goal: z.string().min(1),
    tool: ToolIdSchema,
    inputSchema: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
    estCostUsd: z.number().min(0),
    estMin: z.number().min(0),
    riskTier: RiskTierSchema,
    dependsOn: z.array(z.string()),
    successCriteria: z.array(CriterionSchema).min(1),
    compensation: PlanNodeSchema.optional(),
  })
);

export const PlanGraphSchema = z.object({
  id: z.string().min(1),
  objective: z.string().min(1),
  root: z.array(PlanNodeSchema).min(1),
  budgetUsd: z.number().min(0),
  budgetMin: z.number().min(0),
  createdBy: z.literal("planner-v1"),
  createdAt: z.string(),
  seed: z.string().min(1),
  promptHash: z.string().min(1),
});
export type PlanGraph = z.infer<typeof PlanGraphSchema>;

// ---------------------------------------------------------------------------
// Execution trace
// ---------------------------------------------------------------------------
export const StepOutcomeSchema = z.enum([
  "success",
  "failure",
  "denied",
  "skipped",
  "compensated",
]);
export type StepOutcome = z.infer<typeof StepOutcomeSchema>;

export const StepRecordSchema = z.object({
  nodeId: z.string(),
  attempt: z.number().int().min(1),
  toolId: ToolIdSchema,
  idempotencyKey: z.string(),
  inputHash: z.string(),
  startedAtIso: z.string(),
  finishedAtIso: z.string().nullable(),
  durationMs: z.number().int().min(0).nullable(),
  costUsd: z.number().min(0),
  outcome: StepOutcomeSchema,
  outputSummary: z.string().nullable(),
  error: z.string().nullable(),
  seedUsed: z.string(),
});
export type StepRecord = z.infer<typeof StepRecordSchema>;

export const RunTraceSchema = z.object({
  runId: z.string(),
  planId: z.string(),
  steps: z.array(StepRecordSchema),
  totalCostUsd: z.number().min(0),
  totalMin: z.number().min(0),
  verdict: z.enum(["success", "partial", "aborted"]),
  replayHash: z.string(),
});
export type RunTrace = z.infer<typeof RunTraceSchema>;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
export type SideEffect = "read" | "idempotent-write" | "write" | "external";

export interface Preview {
  summary: string;
  estimatedDiff: Record<string, unknown>;
}

export interface ToolSpec {
  id: ToolId;
  sideEffects: SideEffect;
  riskTier: RiskTier;
  timeoutMs: number;
  retry: { max: number; backoffMs: number };
  dryRun(input: unknown): Promise<Preview>;
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------
export const RoleSchema = z.enum([
  "executive-sponsor",
  "finance-lead",
  "compliance-officer",
  "people-lead",
]);
export type Role = z.infer<typeof RoleSchema>;

export const PolicyDecisionSchema = z.object({
  allow: z.boolean(),
  reasons: z.array(z.string()),
  requiresApprovalFrom: z.array(RoleSchema).optional(),
  expiresAt: z.string().optional(),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------
export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
}
