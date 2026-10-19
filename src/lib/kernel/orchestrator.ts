// =============================================================================
// LEADOS kernel — the orchestration kernel
// =============================================================================
// ONE consolidated loop (replacing the upstream repo's duplicated
// agentLoop/agentCycle/agentScheduler/autonomousRunner/orchestrator
// implementations) with a typed 7-step interface:
//
//   observe -> orient -> hypothesize -> plan -> act -> verify -> learn
//
// Every run is event-sourced: a `kernel_runs` header row, one `kernel_steps`
// row per phase (with input/output snapshots), and one `kernel_tool_calls`
// row per attempted capability invocation — all queryable via
// GET /api/autonomous/history.

import { db } from "@/db";
import { approvals, findings, kernelRuns, kernelSteps, kernelToolCalls, workItems } from "@/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import { ensureBuiltinCapabilitiesRegistered } from "./capabilities";
import { requireCapability, UnregisteredCapabilityError } from "./registry";
import { getAutonomySettings } from "./killSwitch";
import { getCapabilityOverride } from "./killSwitch";
import { tryConsumeBudget, DEFAULT_DAILY_BUDGET } from "./budget";
import { recordAudit } from "./audit";
import type { CapabilityContext, EnforcementMode, PlannedAction, RiskClass, StepPhase, ToolCallStatus } from "./types";

ensureBuiltinCapabilitiesRegistered();

export interface KernelTrigger {
  type: "cron" | "event" | "manual";
  source: string;
}

export interface RunCycleOptions {
  trigger: KernelTrigger;
  dryRun?: boolean;
  actor?: string;
  /** cap how many findings get planned against, keeps demo/test runs small */
  maxFindings?: number;
}

interface Hypothesis {
  findingId: number;
  domain: string;
  severity: number;
  title: string;
  suspectedCause: string;
  confidence: number;
}

async function recordStep<TIn, TOut>(
  runId: number,
  stepIndex: number,
  phase: StepPhase,
  input: TIn,
  fn: () => Promise<TOut>,
): Promise<TOut> {
  const startedAt = new Date();
  try {
    const output = await fn();
    await db.insert(kernelSteps).values({
      runId,
      stepIndex,
      phase,
      input: input as Record<string, unknown>,
      output: output as Record<string, unknown>,
      status: "ok",
      startedAt,
      completedAt: new Date(),
    });
    return output;
  } catch (err) {
    await db.insert(kernelSteps).values({
      runId,
      stepIndex,
      phase,
      input: input as Record<string, unknown>,
      output: { error: err instanceof Error ? err.message : String(err) },
      status: "error",
      startedAt,
      completedAt: new Date(),
    });
    throw err;
  }
}

async function resolveEffectiveMode(capabilityKey: string, defaultMode: EnforcementMode): Promise<EnforcementMode> {
  const override = await getCapabilityOverride(capabilityKey);
  return override?.mode ?? defaultMode;
}

async function resolveEnabled(capabilityKey: string): Promise<boolean> {
  const override = await getCapabilityOverride(capabilityKey);
  return override?.enabled ?? true;
}

async function resolveDailyBudget(capabilityKey: string): Promise<number> {
  const override = await getCapabilityOverride(capabilityKey);
  return override?.dailyBudget ?? DEFAULT_DAILY_BUDGET;
}

/**
 * Executes one already-planned & approved tool call for real. Shared by the
 * kernel's own act() phase (auto-mode actions) and the approvals API
 * (ask-once actions, once a human has approved them) so there is exactly one
 * code path that ever calls capability.execute().
 */
export async function executeToolCall(toolCallId: number, actor: string): Promise<void> {
  const rows = await db.select().from(kernelToolCalls).where(eq(kernelToolCalls.id, toolCallId)).limit(1);
  const toolCall = rows[0];
  if (!toolCall) throw new Error(`Tool call #${toolCallId} not found`);

  const capability = requireCapability(toolCall.capabilityKey);
  const enabled = await resolveEnabled(toolCall.capabilityKey);
  if (!enabled) {
    await db.update(kernelToolCalls).set({ status: "skipped_disabled" }).where(eq(kernelToolCalls.id, toolCallId));
    await recordAudit({
      actor,
      action: "tool_call.skipped_disabled",
      subjectType: "kernel_tool_call",
      subjectId: String(toolCallId),
      reason: `Capability ${toolCall.capabilityKey} is disabled`,
      riskClass: toolCall.riskClass as RiskClass,
    });
    return;
  }

  const budgetOk = await tryConsumeBudget(capability.domain, toolCall.costEstimate, await resolveDailyBudget(toolCall.capabilityKey));
  if (!budgetOk) {
    await db.update(kernelToolCalls).set({ status: "skipped_budget" }).where(eq(kernelToolCalls.id, toolCallId));
    await recordAudit({
      actor,
      action: "tool_call.skipped_budget",
      subjectType: "kernel_tool_call",
      subjectId: String(toolCallId),
      reason: `Daily budget exceeded for domain ${capability.domain}`,
      riskClass: toolCall.riskClass as RiskClass,
    });
    return;
  }

  const ctx: CapabilityContext = { runId: toolCall.runId, dryRun: false, actor };
  try {
    const result = await capability.execute(toolCall.params ?? {}, ctx);
    await db
      .update(kernelToolCalls)
      .set({ status: "executed", actualResult: result as unknown as Record<string, unknown>, undoHandle: result.undoHandle ?? null, executedAt: new Date() })
      .where(eq(kernelToolCalls.id, toolCallId));
    await recordAudit({
      actor,
      action: "tool_call.executed",
      subjectType: "kernel_tool_call",
      subjectId: String(toolCallId),
      reason: result.summary,
      riskClass: toolCall.riskClass as RiskClass,
      rollbackHandle: result.undoHandle ?? null,
      metadata: { capability: toolCall.capabilityKey, params: toolCall.params },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(kernelToolCalls).set({ status: "failed", actualResult: { error: message } }).where(eq(kernelToolCalls.id, toolCallId));
    await recordAudit({
      actor,
      action: "tool_call.failed",
      subjectType: "kernel_tool_call",
      subjectId: String(toolCallId),
      reason: message,
      riskClass: toolCall.riskClass as RiskClass,
    });
  }
}

export async function undoToolCall(toolCallId: number, actor: string): Promise<void> {
  const rows = await db.select().from(kernelToolCalls).where(eq(kernelToolCalls.id, toolCallId)).limit(1);
  const toolCall = rows[0];
  if (!toolCall) throw new Error(`Tool call #${toolCallId} not found`);
  if (toolCall.status !== "executed" || !toolCall.undoHandle) {
    throw new Error(`Tool call #${toolCallId} has nothing to undo (status=${toolCall.status})`);
  }
  const capability = requireCapability(toolCall.capabilityKey);
  await capability.undo(toolCall.undoHandle, { runId: toolCall.runId, dryRun: false, actor });
  await db.update(kernelToolCalls).set({ undone: true }).where(eq(kernelToolCalls.id, toolCallId));
  await recordAudit({
    actor,
    action: "tool_call.undone",
    subjectType: "kernel_tool_call",
    subjectId: String(toolCallId),
    reason: "Manual rollback",
    riskClass: toolCall.riskClass as RiskClass,
    rollbackHandle: toolCall.undoHandle,
  });
}

export interface RunCycleResult {
  runId: number;
  status: string;
  plannedActions: number;
  executed: number;
  pendingApproval: number;
  skippedBudget: number;
  skippedDisabled: number;
  rejectedManual: number;
  rollbackPoints: string[];
}

export async function runCycle(options: RunCycleOptions): Promise<RunCycleResult> {
  const actor = options.actor ?? "agent:kernel";
  const maxFindings = options.maxFindings ?? 20;
  const autonomy = await getAutonomySettings();
  const globalDryRun = options.dryRun === true || autonomy.paused;

  const [run] = await db
    .insert(kernelRuns)
    .values({
      triggerType: options.trigger.type,
      triggerSource: options.trigger.source,
      dryRun: globalDryRun,
      status: "running",
      createdBy: actor,
    })
    .returning();

  let stepIndex = 0;

  // ---- 1. observe ----------------------------------------------------------
  const observation = await recordStep(run.id, stepIndex++, "observe", {}, async () => {
    const openFindings = await db
      .select()
      .from(findings)
      .where(eq(findings.status, "open"))
      .orderBy(desc(findings.severity))
      .limit(maxFindings);
    const dueSoon = await db
      .select()
      .from(workItems)
      .where(and(eq(workItems.status, "approved"), gte(workItems.slaDueAt, new Date())));
    return { openFindingsCount: openFindings.length, openFindings, dueSoonCount: dueSoon.length };
  });

  // ---- 2. orient -------------------------------------------------------------
  const orientation = await recordStep(run.id, stepIndex++, "orient", { count: observation.openFindingsCount }, async () => {
    const prioritized = [...observation.openFindings].sort((a, b) => b.severity - a.severity);
    const critical = prioritized.filter((f) => f.severity >= 5).length;
    const high = prioritized.filter((f) => f.severity === 4).length;
    return { prioritizedIds: prioritized.map((f) => f.id), critical, high };
  });

  // ---- 3. hypothesize --------------------------------------------------------
  const hypotheses = await recordStep(run.id, stepIndex++, "hypothesize", { prioritizedIds: orientation.prioritizedIds }, async () => {
    const list: Hypothesis[] = observation.openFindings.map((f) => ({
      findingId: f.id,
      domain: f.domain,
      severity: f.severity,
      title: f.title,
      suspectedCause: `${f.domain} finding "${f.title}" crossed a severity-${f.severity} threshold`,
      confidence: Math.min(0.95, 0.5 + f.severity * 0.09),
    }));
    return { hypotheses: list };
  });

  // ---- 4. plan ----------------------------------------------------------------
  const plan = await recordStep(run.id, stepIndex++, "plan", { hypothesesCount: hypotheses.hypotheses.length }, async () => {
    const actions: PlannedAction[] = [];
    for (const h of hypotheses.hypotheses) {
      actions.push({
        capabilityKey: "findings.create_work_item",
        params: {
          findingId: h.findingId,
          title: `Investigate: ${h.title}`,
          description: h.suspectedCause,
          domain: h.domain,
          riskClass: h.severity >= 5 ? "high" : h.severity >= 4 ? "medium" : "low",
          slaHours: h.severity >= 5 ? 4 : h.severity >= 4 ? 24 : 72,
        },
        rationale: h.suspectedCause,
      });
      if (h.severity >= 4) {
        actions.push({
          capabilityKey: "notifications.notify",
          params: { title: `Severity-${h.severity} finding`, body: h.title, severity: h.severity >= 5 ? "critical" : "warn" },
          rationale: "High-severity findings always get a notification.",
        });
      }
      if (h.severity >= 5) {
        actions.push({
          capabilityKey: "playbook.trigger_escalation",
          params: { workItemId: -1, assignee: "on-call" },
          rationale: "Severity-5 findings are escalated to running immediately pending approval.",
        });
      }
    }
    return { actions, planSummary: `${actions.length} action(s) planned from ${hypotheses.hypotheses.length} hypothesis(es).` };
  });

  await db.update(kernelRuns).set({ planSummary: plan.planSummary }).where(eq(kernelRuns.id, run.id));

  // ---- 5. act -------------------------------------------------------------------
  const actOutcome = await recordStep(run.id, stepIndex++, "act", { actionCount: plan.actions.length }, async () => {
    let executed = 0;
    let pendingApproval = 0;
    let skippedBudget = 0;
    let skippedDisabled = 0;
    let rejectedManual = 0;
    const rollbackPoints: string[] = [];

    for (const action of plan.actions) {
      let capability;
      try {
        capability = requireCapability(action.capabilityKey);
      } catch (err) {
        if (err instanceof UnregisteredCapabilityError) {
          await recordAudit({
            actor,
            action: "tool_call.rejected_unregistered",
            subjectType: "capability",
            subjectId: action.capabilityKey,
            reason: err.message,
            riskClass: "high",
          });
          continue;
        }
        throw err;
      }

      const enabled = await resolveEnabled(capability.key);
      const effectiveMode = await resolveEffectiveMode(capability.key, capability.defaultMode);
      const ctx: CapabilityContext = { runId: run.id, dryRun: true, actor };
      const predictedDiff = await capability.simulate(action.params, ctx);

      let status: ToolCallStatus = "pending";
      if (globalDryRun) status = "skipped_dry_run";
      else if (!enabled) status = "skipped_disabled";
      else if (effectiveMode === "manual") status = "rejected";
      else if (effectiveMode === "ask-once" || capability.riskClass !== "low") status = "pending";
      else status = "pending"; // auto + low risk still goes through the budget/execute branch below

      const [toolCallRow] = await db
        .insert(kernelToolCalls)
        .values({
          runId: run.id,
          capabilityKey: capability.key,
          params: action.params as Record<string, unknown>,
          riskClass: capability.riskClass,
          mode: effectiveMode,
          dryRun: globalDryRun,
          status,
          costEstimate: capability.estimateCost(action.params),
          predictedDiff: predictedDiff as unknown as Record<string, unknown>,
        })
        .returning();

      if (globalDryRun) {
        continue;
      }
      if (!enabled) {
        skippedDisabled++;
        continue;
      }
      if (effectiveMode === "manual") {
        rejectedManual++;
        await recordAudit({
          actor,
          action: "tool_call.rejected_manual_tier",
          subjectType: "kernel_tool_call",
          subjectId: String(toolCallRow.id),
          reason: `Capability ${capability.key} is manual-tier; kernel will never auto-execute it.`,
          riskClass: capability.riskClass,
        });
        continue;
      }
      if (effectiveMode === "ask-once" || capability.riskClass !== "low") {
        const [approvalRow] = await db
          .insert(approvals)
          .values({
            toolCallId: toolCallRow.id,
            riskClass: capability.riskClass,
            summary: predictedDiff.summary,
          })
          .returning();
        await db.update(kernelToolCalls).set({ approvalId: approvalRow.id }).where(eq(kernelToolCalls.id, toolCallRow.id));
        pendingApproval++;
        await recordAudit({
          actor,
          action: "tool_call.awaiting_approval",
          subjectType: "kernel_tool_call",
          subjectId: String(toolCallRow.id),
          reason: predictedDiff.summary,
          riskClass: capability.riskClass,
        });
        continue;
      }

      // auto + low risk: budget-gated immediate execution.
      const budgetOk = await tryConsumeBudget(capability.domain, capability.estimateCost(action.params), await resolveDailyBudget(capability.key));
      if (!budgetOk) {
        skippedBudget++;
        await db.update(kernelToolCalls).set({ status: "skipped_budget" }).where(eq(kernelToolCalls.id, toolCallRow.id));
        await recordAudit({
          actor,
          action: "tool_call.skipped_budget",
          subjectType: "kernel_tool_call",
          subjectId: String(toolCallRow.id),
          reason: `Daily budget exceeded for domain ${capability.domain}`,
          riskClass: capability.riskClass,
        });
        continue;
      }

      const execCtx: CapabilityContext = { runId: run.id, dryRun: false, actor };
      try {
        const result = await capability.execute(action.params, execCtx);
        executed++;
        if (result.undoHandle) rollbackPoints.push(result.undoHandle);
        await db
          .update(kernelToolCalls)
          .set({ status: "executed", actualResult: result as unknown as Record<string, unknown>, undoHandle: result.undoHandle ?? null, executedAt: new Date() })
          .where(eq(kernelToolCalls.id, toolCallRow.id));
        await recordAudit({
          actor,
          action: "tool_call.executed",
          subjectType: "kernel_tool_call",
          subjectId: String(toolCallRow.id),
          reason: result.summary,
          riskClass: capability.riskClass,
          rollbackHandle: result.undoHandle ?? null,
          metadata: { capability: capability.key },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.update(kernelToolCalls).set({ status: "failed", actualResult: { error: message } }).where(eq(kernelToolCalls.id, toolCallRow.id));
        await recordAudit({
          actor,
          action: "tool_call.failed",
          subjectType: "kernel_tool_call",
          subjectId: String(toolCallRow.id),
          reason: message,
          riskClass: capability.riskClass,
        });
      }
    }

    return { executed, pendingApproval, skippedBudget, skippedDisabled, rejectedManual, rollbackPoints };
  });

  // ---- 6. verify ----------------------------------------------------------------
  const verification = await recordStep(run.id, stepIndex++, "verify", { executed: actOutcome.executed }, async () => {
    const executedCalls = await db
      .select()
      .from(kernelToolCalls)
      .where(and(eq(kernelToolCalls.runId, run.id), eq(kernelToolCalls.status, "executed")));
    return {
      verifiedCount: executedCalls.length,
      note: "Predicted diffs recorded at plan time; actual results captured at execution time for human comparison.",
    };
  });

  // ---- 7. learn -------------------------------------------------------------------
  const learning = await recordStep(run.id, stepIndex++, "learn", { verifiedCount: verification.verifiedCount }, async () => {
    return {
      lessons:
        actOutcome.pendingApproval > 0
          ? [`${actOutcome.pendingApproval} medium/high-risk action(s) are waiting on human approval before they can execute.`]
          : ["No actions required human approval this cycle."],
    };
  });

  const finalStatus = globalDryRun ? "completed" : autonomy.paused ? "paused_budget" : "completed";

  await db
    .update(kernelRuns)
    .set({
      status: finalStatus,
      outcome: { ...actOutcome, ...learning } as Record<string, unknown>,
      rollbackPoints: actOutcome.rollbackPoints,
      completedAt: new Date(),
    })
    .where(eq(kernelRuns.id, run.id));

  return {
    runId: run.id,
    status: finalStatus,
    plannedActions: plan.actions.length,
    executed: actOutcome.executed,
    pendingApproval: actOutcome.pendingApproval,
    skippedBudget: actOutcome.skippedBudget,
    skippedDisabled: actOutcome.skippedDisabled,
    rejectedManual: actOutcome.rejectedManual,
    rollbackPoints: actOutcome.rollbackPoints,
  };
}

export async function getRunHistory(limit = 25) {
  const runs = await db.select().from(kernelRuns).orderBy(desc(kernelRuns.startedAt)).limit(limit);
  return runs;
}

export async function getRunDetail(runId: number) {
  const [run] = await db.select().from(kernelRuns).where(eq(kernelRuns.id, runId)).limit(1);
  if (!run) return null;
  const steps = await db.select().from(kernelSteps).where(eq(kernelSteps.runId, runId)).orderBy(kernelSteps.stepIndex);
  const toolCalls = await db.select().from(kernelToolCalls).where(eq(kernelToolCalls.runId, runId));
  return { run, steps, toolCalls };
}
