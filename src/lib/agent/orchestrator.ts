// LEADOS Agent Kernel — Orchestrator.
//
// This is the ONLY place in the codebase that turns an objective into a
// persisted `agent_runs` row. It (1) builds a PlanGraph via the Planner, (2)
// validates it against the zod contract + Kahn cycle check + budget sanity
// (validate.ts) BEFORE anything is written to the database, and (3) enqueues
// the run with status='queued'. Execution happens later, out-of-request, in
// the background worker (worker.ts) — this function never calls the
// executor directly, so a slow/expensive plan can never block an HTTP
// request thread.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns, planNodes, planRejections } from "@/db/schema";
import { SystemClock } from "./clock";
import { buildPlanGraph } from "./planner";
import type { PlanGraph } from "./types";
import { validatePlanGraph } from "./validate";

export interface CreateRunRequest {
  objective: string;
  budgetUsd: number;
  budgetMin: number;
  requestedBy: string;
  /** Test/eval-only override. Production callers always get a fresh randomUUID(). */
  seedOverride?: string;
}

export type CreateRunResult =
  | { ok: true; runId: string; planId: string }
  | { ok: false; errors: string[] };

export async function createAndEnqueueRun(req: CreateRunRequest): Promise<CreateRunResult> {
  const seed = req.seedOverride ?? randomUUID();
  const clock = new SystemClock();
  const plan = buildPlanGraph({
    objective: req.objective,
    budgetUsd: req.budgetUsd,
    budgetMin: req.budgetMin,
    seed,
    clock,
  });

  const validation = validatePlanGraph(plan);
  if (!validation.valid) {
    await db.insert(planRejections).values({ objective: req.objective, errors: validation.errors });
    return { ok: false, errors: validation.errors };
  }

  const [run] = await db
    .insert(agentRuns)
    .values({
      objective: req.objective,
      planId: plan.id,
      status: "queued",
      budgetUsd: req.budgetUsd.toFixed(4),
      budgetMin: req.budgetMin,
      seed,
      promptHash: plan.promptHash,
      requestedBy: req.requestedBy,
      planGraph: plan,
    })
    .returning({ id: agentRuns.id });

  await db.insert(planNodes).values(
    plan.root.map((n) => ({
      runId: run.id,
      nodeId: n.id,
      kind: n.kind,
      goal: n.goal,
      tool: n.tool,
      inputSchema: n.inputSchema,
      estCostUsd: n.estCostUsd.toFixed(4),
      estMin: n.estMin.toFixed(2),
      riskTier: n.riskTier,
      dependsOn: n.dependsOn,
      successCriteria: n.successCriteria,
      compensationNodeId: n.compensation?.id ?? null,
      status: "pending" as const,
    }))
  );

  return { ok: true, runId: run.id, planId: plan.id };
}

export async function countInvalidPlanAttempts(): Promise<number> {
  const rows = await db.select().from(planRejections);
  return rows.length;
}

// Deterministic replay: clone the ORIGINAL plan graph verbatim (same seed,
// same node ids, same tool bindings) into a brand-new run row and let the
// worker execute it. Because the Planner, Executor and tool layer are pure
// functions of (plan, seed) with no reachable bare wall-clock or RNG reads,
// the replay's `replayHash` should equal the original's hash. This is what
// `/api/agent/runs/[id]/replay` measures.
export async function createReplayRun(originalRunId: string): Promise<{ replayRunId: string }> {
  const [original] = await db.select().from(agentRuns).where(eq(agentRuns.id, originalRunId));
  if (!original) throw new Error(`run ${originalRunId} not found`);
  const plan = original.planGraph as PlanGraph;

  const [replay] = await db
    .insert(agentRuns)
    .values({
      objective: original.objective,
      planId: plan.id,
      status: "queued",
      budgetUsd: original.budgetUsd,
      budgetMin: original.budgetMin,
      seed: original.seed,
      promptHash: original.promptHash,
      requestedBy: `replay-of:${originalRunId}`,
      planGraph: plan,
    })
    .returning({ id: agentRuns.id });

  await db.insert(planNodes).values(
    plan.root.map((n) => ({
      runId: replay.id,
      nodeId: n.id,
      kind: n.kind,
      goal: n.goal,
      tool: n.tool,
      inputSchema: n.inputSchema,
      estCostUsd: n.estCostUsd.toFixed(4),
      estMin: n.estMin.toFixed(2),
      riskTier: n.riskTier,
      dependsOn: n.dependsOn,
      successCriteria: n.successCriteria,
      compensationNodeId: n.compensation?.id ?? null,
      status: "pending" as const,
    }))
  );

  return { replayRunId: replay.id };
}
