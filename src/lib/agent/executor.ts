// LEADOS Agent Kernel — Executor (saga runner).
//
// Executes a validated PlanGraph's nodes in dependency (topological) order.
// Before EVERY node:
//   1. Budget check — if the node's estimated cost/time would push the
//      run's cumulative totals past budgetUsd/budgetMin, the run is ABORTED
//      and all completed nodes are compensated in reverse order. The check
//      happens before execution, never after (no "oops, refund" pattern).
//   2. PolicyGate check — policy.evaluate() must return allow=true (directly,
//      or because a human approval ticket was already granted) or the node
//      is either denied-and-aborted (hard PROHIBITED) or the run is parked
//      in `awaiting_approval` (soft gate) for a human to resolve.
// Idempotency: every node execution is guarded by a Postgres-unique
// idempotency key so a crash-and-resume (or a duplicate worker tick) can
// never double-execute a side effect.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns, approvals, planNodes, policyDecisions, stepRecords } from "@/db/schema";
import type { Clock } from "./clock";
import { hashOf, replayHashOf } from "./hash";
import { claimIdempotencyKey, idempotencyKeyFor, recordIdempotentResult } from "./idempotency";
import * as policy from "./policy";
import { invokeTool } from "./tools";
import type { PlanGraph, PlanNode, ToolId } from "./types";
import { topologicalOrderKahn } from "./validate";

export type RunStatus =
  | "queued"
  | "planning"
  | "running"
  | "awaiting_approval"
  | "critic_review"
  | "replanning"
  | "success"
  | "partial"
  | "aborted"
  | "failed";

interface RunRow {
  id: string;
  planGraph: PlanGraph;
  budgetUsd: number;
  budgetMin: number;
  totalCostUsd: number;
  totalMin: number;
  status: string;
}

async function loadRun(runId: string): Promise<RunRow> {
  const [row] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId));
  if (!row) throw new Error(`agent run ${runId} not found`);
  return {
    id: row.id,
    planGraph: row.planGraph as PlanGraph,
    budgetUsd: Number(row.budgetUsd),
    budgetMin: Number(row.budgetMin),
    totalCostUsd: Number(row.totalCostUsd),
    totalMin: Number(row.totalMin),
    status: row.status,
  };
}

function orderedNodes(plan: PlanGraph): PlanNode[] {
  const ids = plan.root.map((n) => n.id);
  const edges: Array<[string, string]> = [];
  for (const n of plan.root) for (const dep of n.dependsOn) edges.push([dep, n.id]);
  const { order, hasCycle } = topologicalOrderKahn(ids, edges);
  if (hasCycle) throw new Error("INVARIANT_VIOLATION: cyclic plan reached the executor");
  const byId = new Map(plan.root.map((n) => [n.id, n]));
  return order.map((id) => byId.get(id)!);
}

async function latestApprovedApprovalId(runId: string, nodeId: string): Promise<number | null> {
  const rows = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.runId, runId), eq(approvals.nodeId, nodeId), eq(approvals.status, "approved")));
  return rows.length > 0 ? rows[rows.length - 1].id : null;
}

async function pendingApprovalExists(runId: string, nodeId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.runId, runId), eq(approvals.nodeId, nodeId), eq(approvals.status, "pending")));
  return rows.length > 0;
}

async function nodeRowStatus(runId: string, nodeId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(planNodes)
    .where(and(eq(planNodes.runId, runId), eq(planNodes.nodeId, nodeId)));
  return row?.status ?? null;
}

async function markNodeStatus(runId: string, nodeId: string, status: string) {
  await db
    .update(planNodes)
    .set({ status })
    .where(and(eq(planNodes.runId, runId), eq(planNodes.nodeId, nodeId)));
}

async function insertStepRecord(args: {
  runId: string;
  nodeId: string;
  toolId: ToolId;
  idempotencyKey: string;
  inputHash: string;
  startedAtIso: string;
  finishedAtIso: string | null;
  durationMs: number | null;
  costUsd: number;
  outcome: "success" | "failure" | "denied" | "skipped" | "compensated";
  outputSummary: string | null;
  policyDecisionId: number | null;
  error: string | null;
  seedUsed: string;
}) {
  await db.insert(stepRecords).values({
    runId: args.runId,
    nodeId: args.nodeId,
    attempt: 1,
    toolId: args.toolId,
    idempotencyKey: args.idempotencyKey,
    inputHash: args.inputHash,
    startedAt: new Date(args.startedAtIso),
    finishedAt: args.finishedAtIso ? new Date(args.finishedAtIso) : null,
    durationMs: args.durationMs,
    costUsd: args.costUsd.toFixed(4),
    outcome: args.outcome,
    outputSummary: args.outputSummary,
    policyDecisionId: args.policyDecisionId,
    error: args.error,
    seedUsed: args.seedUsed,
  });
}

async function recordPolicyDecision(args: {
  runId: string;
  nodeId: string;
  toolId: ToolId;
  riskTier: number;
  decision: { allow: boolean; reasons: string[]; requiresApprovalFrom?: string[] };
}): Promise<number> {
  const [row] = await db
    .insert(policyDecisions)
    .values({
      runId: args.runId,
      nodeId: args.nodeId,
      toolId: args.toolId,
      riskTier: args.riskTier,
      allow: args.decision.allow,
      reasons: args.decision.reasons,
      requiresApprovalFrom: args.decision.requiresApprovalFrom ?? null,
    })
    .returning({ id: policyDecisions.id });
  return row.id;
}

async function ensureApprovalTicket(args: {
  runId: string;
  nodeId: string;
  policyDecisionId: number;
  roles: string[];
  seed: string;
  estCostUsd: number;
}) {
  const exists = await pendingApprovalExists(args.runId, args.nodeId);
  if (exists) return;
  // Random attention checks (PHASE 5 mitigation for approval fatigue / rubber
  // stamping): derived deterministically from seed+nodeId (never
  // Math.random(), so it is still replay-safe), roughly 1-in-3 approvals
  // require the reviewer to type the node's exact estimated cost into their
  // reason — a fact only visible if they actually opened the node detail,
  // not something guessable from the approval list alone.
  const bucket = parseInt(hashOf({ seed: args.seed, nodeId: args.nodeId }).slice(0, 4), 16) % 3;
  const attentionRequired = bucket === 0;
  const attentionNonce = attentionRequired ? args.estCostUsd.toFixed(4) : null;
  await db.insert(approvals).values({
    runId: args.runId,
    nodeId: args.nodeId,
    policyDecisionId: args.policyDecisionId,
    role: args.roles[0] ?? "executive-sponsor",
    status: "pending",
    attentionRequired,
    attentionNonce,
  });
}

interface ExecuteOutcome {
  verdict: "success" | "partial" | "aborted" | "in_progress" | "awaiting_approval";
}

export async function runOrResumeRun(runId: string, clock: Clock): Promise<ExecuteOutcome> {
  const run = await loadRun(runId);
  const nodes = orderedNodes(run.planGraph);
  const completedForCompensation: PlanNode[] = [];

  let cumulativeCost = run.totalCostUsd;
  let cumulativeMin = run.totalMin;

  await db.update(agentRuns).set({ status: "running", updatedAt: new Date(clock.nowIso()) }).where(eq(agentRuns.id, runId));

  for (const node of nodes) {
    const existingStatus = await nodeRowStatus(runId, node.id);
    if (existingStatus === "done" || existingStatus === "skipped") {
      completedForCompensation.push(node);
      continue;
    }
    if (existingStatus === "denied" || existingStatus === "compensated") {
      // Already terminal for this node in a prior pass; nothing to do.
      continue;
    }

    // --- 1. Budget gate, checked BEFORE execution. ---
    const projectedCost = cumulativeCost + node.estCostUsd;
    const projectedMin = cumulativeMin + node.estMin;
    if (projectedCost > run.budgetUsd || projectedMin > run.budgetMin) {
      await abortAndCompensate({
        runId,
        plan: run.planGraph,
        completed: completedForCompensation,
        reason: `budget exceeded before node ${node.id}: projected $${projectedCost.toFixed(4)}/${projectedMin.toFixed(2)}min vs budget $${run.budgetUsd}/${run.budgetMin}min`,
        clock,
      });
      return { verdict: "aborted" };
    }

    // --- 2. Policy gate. ---
    const approvedId = await latestApprovedApprovalId(runId, node.id);
    const decision = policy.evaluate(node, node.input, { approvedApprovalId: approvedId });
    const policyDecisionId = await recordPolicyDecision({
      runId,
      nodeId: node.id,
      toolId: node.tool,
      riskTier: node.riskTier,
      decision,
    });

    const inputHash = hashOf(node.input);
    const idemKey = idempotencyKeyFor(runId, node.id);

    if (!decision.allow) {
      const isHardProhibited = decision.reasons.some((r) => r.startsWith("PROHIBITED"));
      if (isHardProhibited) {
        await insertStepRecord({
          runId,
          nodeId: node.id,
          toolId: node.tool,
          idempotencyKey: idemKey,
          inputHash,
          startedAtIso: clock.nowIso(),
          finishedAtIso: clock.nowIso(),
          durationMs: 0,
          costUsd: 0,
          outcome: "denied",
          outputSummary: decision.reasons.join("; "),
          policyDecisionId,
          error: null,
          seedUsed: run.planGraph.seed,
        });
        await markNodeStatus(runId, node.id, "denied");
        await abortAndCompensate({
          runId,
          plan: run.planGraph,
          completed: completedForCompensation,
          reason: `node ${node.id} denied by policy: ${decision.reasons.join("; ")}`,
          clock,
        });
        return { verdict: "aborted" };
      }
      // Soft gate: park the run awaiting human approval.
      await ensureApprovalTicket({
        runId,
        nodeId: node.id,
        policyDecisionId,
        roles: decision.requiresApprovalFrom ?? ["executive-sponsor"],
        seed: run.planGraph.seed,
        estCostUsd: node.estCostUsd,
      });
      await db
        .update(agentRuns)
        .set({ status: "awaiting_approval", updatedAt: new Date(clock.nowIso()) })
        .where(eq(agentRuns.id, runId));
      return { verdict: "awaiting_approval" };
    }

    // --- 3. Idempotent execution. ---
    const claim = await claimIdempotencyKey(runId, node.id);
    const startedAtIso = clock.nowIso();
    if (!claim.claimed) {
      await insertStepRecord({
        runId,
        nodeId: node.id,
        toolId: node.tool,
        idempotencyKey: idemKey,
        inputHash,
        startedAtIso,
        finishedAtIso: startedAtIso,
        durationMs: 0,
        costUsd: 0,
        outcome: "skipped",
        outputSummary: "idempotency key already claimed; duplicate execution prevented",
        policyDecisionId,
        error: null,
        seedUsed: run.planGraph.seed,
      });
      await markNodeStatus(runId, node.id, "done");
      completedForCompensation.push(node);
      continue;
    }

    try {
      const startMs = clock.nowMs();
      const result = await invokeTool(node.tool, node.input, { runId, nodeId: node.id }, decision);
      const endMs = clock.nowMs();
      await recordIdempotentResult(claim.key, hashOf(result));
      await insertStepRecord({
        runId,
        nodeId: node.id,
        toolId: node.tool,
        idempotencyKey: idemKey,
        inputHash,
        startedAtIso,
        finishedAtIso: clock.nowIso(),
        durationMs: Math.max(1, endMs - startMs),
        costUsd: result.costUsd,
        outcome: "success",
        outputSummary: result.outputSummary,
        policyDecisionId,
        error: null,
        seedUsed: run.planGraph.seed,
      });
      await markNodeStatus(runId, node.id, "done");
      cumulativeCost += result.costUsd;
      cumulativeMin += node.estMin;
      await db
        .update(agentRuns)
        .set({ totalCostUsd: cumulativeCost.toFixed(4), totalMin: cumulativeMin.toFixed(2), updatedAt: new Date(clock.nowIso()) })
        .where(eq(agentRuns.id, runId));
      completedForCompensation.push(node);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await insertStepRecord({
        runId,
        nodeId: node.id,
        toolId: node.tool,
        idempotencyKey: idemKey,
        inputHash,
        startedAtIso,
        finishedAtIso: clock.nowIso(),
        durationMs: 0,
        costUsd: 0,
        outcome: "failure",
        outputSummary: null,
        policyDecisionId,
        error: message,
        seedUsed: run.planGraph.seed,
      });
      await markNodeStatus(runId, node.id, "failed");
      await abortAndCompensate({
        runId,
        plan: run.planGraph,
        completed: completedForCompensation,
        reason: `node ${node.id} failed: ${message}`,
        clock,
      });
      return { verdict: "aborted" };
    }
  }

  await db
    .update(agentRuns)
    .set({ status: "critic_review", updatedAt: new Date(clock.nowIso()) })
    .where(eq(agentRuns.id, runId));
  return { verdict: "success" };
}

async function abortAndCompensate(args: {
  runId: string;
  plan: PlanGraph;
  completed: PlanNode[];
  reason: string;
  clock: Clock;
}) {
  const reversed = args.completed.slice().reverse();
  for (const node of reversed) {
    if (!node.compensation) continue;
    const comp = node.compensation;
    const decision = policy.evaluate(comp, comp.input, { approvedApprovalId: -1 });
    // Hard-deny rules still apply to compensations; soft approval gating is
    // bypassed because compensations reduce blast radius rather than add it.
    const isHardProhibited = decision.reasons.some((r) => r.startsWith("PROHIBITED"));
    const effectiveDecision = isHardProhibited ? decision : { allow: true, reasons: ["system-initiated compensation, auto-authorized"] };
    const inputHash = hashOf(comp.input);
    const idemKey = idempotencyKeyFor(args.runId, comp.id);
    const startedAtIso = args.clock.nowIso();
    if (!effectiveDecision.allow) {
      await insertStepRecord({
        runId: args.runId,
        nodeId: comp.id,
        toolId: comp.tool,
        idempotencyKey: idemKey,
        inputHash,
        startedAtIso,
        finishedAtIso: startedAtIso,
        durationMs: 0,
        costUsd: 0,
        outcome: "denied",
        outputSummary: decision.reasons.join("; "),
        policyDecisionId: null,
        error: null,
        seedUsed: args.plan.seed,
      });
      continue;
    }
    const claim = await claimIdempotencyKey(args.runId, comp.id);
    if (!claim.claimed) continue;
    try {
      const startMs = args.clock.nowMs();
      const result = await invokeTool(comp.tool, comp.input, { runId: args.runId, nodeId: comp.id }, effectiveDecision);
      const endMs = args.clock.nowMs();
      await recordIdempotentResult(claim.key, hashOf(result));
      await insertStepRecord({
        runId: args.runId,
        nodeId: comp.id,
        toolId: comp.tool,
        idempotencyKey: idemKey,
        inputHash,
        startedAtIso,
        finishedAtIso: args.clock.nowIso(),
        durationMs: Math.max(1, endMs - startMs),
        costUsd: result.costUsd,
        outcome: "compensated",
        outputSummary: result.outputSummary,
        policyDecisionId: null,
        error: null,
        seedUsed: args.plan.seed,
      });
      await markNodeStatus(args.runId, node.id, "compensated");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await insertStepRecord({
        runId: args.runId,
        nodeId: comp.id,
        toolId: comp.tool,
        idempotencyKey: idemKey,
        inputHash,
        startedAtIso,
        finishedAtIso: args.clock.nowIso(),
        durationMs: 0,
        costUsd: 0,
        outcome: "failure",
        outputSummary: null,
        policyDecisionId: null,
        error: `COMPENSATION_FAILED: ${message}`,
        seedUsed: args.plan.seed,
      });
      // A failed compensation is a known, ledgered risk (see PHASE 5):
      // it does not crash the run but is recorded verbatim for operator
      // triage rather than silently swallowed.
    }
  }
  await db
    .update(agentRuns)
    .set({ status: "aborted", verdict: "aborted", errorMessage: args.reason, updatedAt: new Date(args.clock.nowIso()) })
    .where(eq(agentRuns.id, args.runId));
}

// Used when a human REJECTS a pending approval: the run cannot proceed, so
// every already-completed node is compensated in reverse order, same as any
// other abort path.
export async function abortRunDueToRejectedApproval(runId: string, clock: Clock): Promise<void> {
  const run = await loadRun(runId);
  const doneRows = await db
    .select()
    .from(planNodes)
    .where(and(eq(planNodes.runId, runId), eq(planNodes.status, "done")));
  const doneIds = new Set(doneRows.map((r) => r.nodeId));
  const completed = run.planGraph.root.filter((n) => doneIds.has(n.id));
  await abortAndCompensate({
    runId,
    plan: run.planGraph,
    completed,
    reason: "a required human approval was rejected",
    clock,
  });
}

export async function computeAndStoreReplayHash(runId: string): Promise<string> {
  const steps = await db
    .select()
    .from(stepRecords)
    .where(eq(stepRecords.runId, runId))
    .orderBy(asc(stepRecords.id));
  const hash = replayHashOf(
    steps.map((s) => ({
      nodeId: s.nodeId,
      attempt: s.attempt,
      toolId: s.toolId,
      idempotencyKey: s.idempotencyKey,
      inputHash: s.inputHash,
      costUsd: Number(s.costUsd),
      outcome: s.outcome,
      outputSummary: s.outputSummary,
    }))
  );
  await db.update(agentRuns).set({ replayHash: hash }).where(eq(agentRuns.id, runId));
  return hash;
}
