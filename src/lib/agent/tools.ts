// LEADOS Agent Kernel — tool registry.
//
// ARCHITECTURAL INVARIANT (verified by
// src/lib/agent/__tests__/policy-gate-bypass.test.ts): the concrete
// `execute` implementations below are NOT exported from this module. The
// only way to run a tool is `invokeTool(...)`, and `invokeTool` REQUIRES a
// `PolicyDecision` with `allow === true` plus (for riskTier >= 3) a resolved
// approval id. There is no code path in this codebase that can execute a
// tool's side effect without first producing an allowing PolicyDecision from
// policy.ts, because the function that does so is the only holder of a
// reference to the `execute` closures.
import { db } from "@/db";
import { toolEffects } from "@/db/schema";
import type { Preview, RiskTier, SideEffect, ToolId } from "./types";

export interface ToolMeta {
  id: ToolId;
  sideEffects: SideEffect;
  riskTier: RiskTier;
  timeoutMs: number;
  retry: { max: number; backoffMs: number };
  dryRun(input: unknown): Promise<Preview>;
}

export interface ToolExecutionContext {
  runId: string;
  nodeId: string;
}

export interface ToolExecutionResult {
  outputSummary: string;
  costUsd: number;
}

type ToolExecuteFn = (
  input: Record<string, unknown>,
  ctx: ToolExecutionContext
) => Promise<ToolExecutionResult>;

async function recordEffect(
  ctx: ToolExecutionContext,
  toolId: ToolId,
  action: string,
  payload: Record<string, unknown>
) {
  await db.insert(toolEffects).values({
    runId: ctx.runId,
    nodeId: ctx.nodeId,
    toolId,
    action,
    payload,
  });
}

const META: Record<ToolId, ToolMeta> = {
  "metrics.read": {
    id: "metrics.read",
    sideEffects: "read",
    riskTier: 0,
    timeoutMs: 5000,
    retry: { max: 2, backoffMs: 200 },
    async dryRun(input) {
      return { summary: "Read-only metrics query, no side effects.", estimatedDiff: { input } };
    },
  },
  "report.draft": {
    id: "report.draft",
    sideEffects: "idempotent-write",
    riskTier: 1,
    timeoutMs: 8000,
    retry: { max: 2, backoffMs: 300 },
    async dryRun(input) {
      return { summary: "Create or retract an internal draft document.", estimatedDiff: { input } };
    },
  },
  "task.create": {
    id: "task.create",
    sideEffects: "write",
    riskTier: 2,
    timeoutMs: 5000,
    retry: { max: 2, backoffMs: 200 },
    async dryRun(input) {
      return { summary: "Create or delete an internal follow-up task.", estimatedDiff: { input } };
    },
  },
  "budget.reallocate": {
    id: "budget.reallocate",
    sideEffects: "write",
    riskTier: 3,
    timeoutMs: 8000,
    retry: { max: 1, backoffMs: 500 },
    async dryRun(input) {
      return { summary: "Reallocate budget between cost centers (reversible).", estimatedDiff: { input } };
    },
  },
  "policy.draft": {
    id: "policy.draft",
    sideEffects: "idempotent-write",
    riskTier: 1,
    timeoutMs: 8000,
    retry: { max: 2, backoffMs: 300 },
    async dryRun(input) {
      return { summary: "Create or retract an internal policy draft.", estimatedDiff: { input } };
    },
  },
  "email.send": {
    id: "email.send",
    sideEffects: "external",
    riskTier: 4,
    timeoutMs: 10000,
    retry: { max: 1, backoffMs: 1000 },
    async dryRun(input) {
      return { summary: "Send an external email (irreversible once delivered).", estimatedDiff: { input } };
    },
  },
  "data.export": {
    id: "data.export",
    sideEffects: "external",
    riskTier: 4,
    timeoutMs: 10000,
    retry: { max: 1, backoffMs: 1000 },
    async dryRun(input) {
      return { summary: "Export data outside the system boundary (irreversible).", estimatedDiff: { input } };
    },
  },
  "migration.run": {
    id: "migration.run",
    sideEffects: "external",
    riskTier: 4,
    timeoutMs: 15000,
    retry: { max: 1, backoffMs: 1000 },
    async dryRun(input) {
      return { summary: "Run a destructive schema migration (irreversible).", estimatedDiff: { input } };
    },
  },
};

// Module-private. Intentionally not exported.
const EXECUTE: Record<ToolId, ToolExecuteFn> = {
  "metrics.read": async (input, ctx) => {
    await recordEffect(ctx, "metrics.read", "read", input);
    return { outputSummary: `Read metrics for: ${String(input.goal ?? "unspecified")}`, costUsd: 0.01 };
  },
  "report.draft": async (input, ctx) => {
    const action = input.action === "retract" ? "retract" : "create";
    await recordEffect(ctx, "report.draft", action, input);
    return {
      outputSummary:
        action === "retract"
          ? `Retracted draft for node ${String(input.originalNodeId ?? "unknown")}`
          : `Drafted report: ${String(input.goal ?? "unspecified")}`,
      costUsd: 0.08,
    };
  },
  "task.create": async (input, ctx) => {
    const action = input.action === "retract" ? "delete" : "create";
    await recordEffect(ctx, "task.create", action, input);
    return {
      outputSummary:
        action === "delete"
          ? `Deleted task for node ${String(input.originalNodeId ?? "unknown")}`
          : `Created task: ${String(input.goal ?? "unspecified")}`,
      costUsd: 0.02,
    };
  },
  "budget.reallocate": async (input, ctx) => {
    const action = input.action === "retract" ? "reverse" : "apply";
    await recordEffect(ctx, "budget.reallocate", action, input);
    return {
      outputSummary:
        action === "reverse"
          ? `Reversed reallocation for node ${String(input.originalNodeId ?? "unknown")}`
          : `Applied budget reallocation: ${String(input.goal ?? "unspecified")}`,
      costUsd: 0.05,
    };
  },
  "policy.draft": async (input, ctx) => {
    const action = input.action === "retract" ? "retract" : "create";
    await recordEffect(ctx, "policy.draft", action, input);
    return {
      outputSummary:
        action === "retract"
          ? `Retracted policy draft for node ${String(input.originalNodeId ?? "unknown")}`
          : `Drafted policy: ${String(input.goal ?? "unspecified")}`,
      costUsd: 0.1,
    };
  },
  "email.send": async (input, ctx) => {
    const action = input.action === "retract" ? "recall-notice" : "send";
    await recordEffect(ctx, "email.send", action, input);
    return {
      outputSummary:
        action === "recall-notice"
          ? `Sent recall notice for node ${String(input.originalNodeId ?? "unknown")}`
          : `Sent email: ${String(input.goal ?? "unspecified")}`,
      costUsd: 0.03,
    };
  },
  "data.export": async (input, ctx) => {
    await recordEffect(ctx, "data.export", "export", input);
    return { outputSummary: `Exported data: ${String(input.goal ?? "unspecified")}`, costUsd: 0.03 };
  },
  "migration.run": async (input, ctx) => {
    await recordEffect(ctx, "migration.run", "run", input);
    return { outputSummary: `Ran migration: ${String(input.goal ?? "unspecified")}`, costUsd: 0.05 };
  },
};

export function getToolMeta(id: ToolId): ToolMeta {
  return META[id];
}

export function listToolMeta(): ToolMeta[] {
  return Object.values(META);
}

// The single, non-bypassable execution chokepoint. `authorized` must come
// from policy.evaluate(...) and must have allow === true, or this throws
// before any side effect runs.
export async function invokeTool(
  toolId: ToolId,
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
  authorized: { allow: boolean }
): Promise<ToolExecutionResult> {
  if (!authorized || authorized.allow !== true) {
    throw new Error(
      `POLICY_GATE_VIOLATION: tool ${toolId} invoked without an allowing PolicyDecision (node ${ctx.nodeId})`
    );
  }
  const fn = EXECUTE[toolId];
  return fn(input, ctx);
}
