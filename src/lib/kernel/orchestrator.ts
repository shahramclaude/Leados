// LEADOS Part 07 — The orchestration kernel.
//
// This is the single consolidated engine for everything that used to be five
// competing loops (agentLoop/agentCycle/agentScheduler/autonomousRunner/
// orchestrator in the mission brief). There is exactly one place a Step is
// executed: `runStep` inside `runCycle`, below.
//
// Event sourcing: every observation, tool call, decision, and outcome is
// appended via `appendEvent` with `correlationId = runId`. `runCycle` and
// `resumeRun` are the same function — resuming after a crash is just calling
// `runCycle` again; the loop always starts from `run.checkpoint` and skips
// any step already `done`, and capability execution is made idempotent via
// `idempotencyKey` so a crash between "side effect written" and "step marked
// done" cannot duplicate the side effect (see capabilities.ts +
// `src/lib/kernel/__tests__/crashResume.test.ts`).
import { db } from "@/db";
import { kernelPlanTypeDryRuns, kernelRuns, kernelSteps } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { newId } from "./ids";
import { appendEvent, listEvents } from "./events";
import { requireCapability } from "./registry";
import { isKillSwitchEngaged } from "./killSwitch";
import { isDomainPaused } from "./severity";
import { tryConsumeBudget, recordCircuitOutcome, backoffWithJitter } from "./budget";
import { evaluateStepPolicy, getActivePolicyVersion, setCapabilityMode } from "./policy";
import { createApprovalRequest, getApproval } from "./approvals";
import { acquireLock, releaseLock, LockContentionError } from "./locks";
import { sendToDeadLetter } from "./deadLetter";
import type {
  Actor,
  Budget,
  CapabilityContext,
  CompensationHandle,
  Plan,
  PredictedDiff,
  RiskClass,
  Step,
  StepKind,
} from "./types";

export const DEFAULT_BUDGET: Budget = {
  maxActions: 20,
  maxDurationMs: 5 * 60_000,
  stepTimeoutMs: 15_000,
};

const MAX_ATTEMPTS = 2;
const BACKOFF_BASE_MS = 5; // kept small so automated tests stay fast; see budget.ts

export interface StepTemplate {
  kind: StepKind;
  capability: string;
  input: unknown;
  risk: RiskClass;
  compensation?: CompensationHandle;
  entityKey?: string;
  idempotencyKey?: string;
}

export function computePlanType(steps: StepTemplate[]): string {
  const sig = steps.map((s) => `${s.kind}:${s.capability}:${s.risk}`).join(">");
  return createHash("sha256").update(sig).digest("hex").slice(0, 16);
}

export async function createPlan(params: {
  goal: string;
  domain: string;
  steps: StepTemplate[];
  budget?: Partial<Budget>;
  dryRun: boolean;
  actor: Actor;
}): Promise<Plan> {
  const planId = newId("run");
  const planType = computePlanType(params.steps);
  const policy = await getActivePolicyVersion();
  const budget: Budget = { ...DEFAULT_BUDGET, ...params.budget };

  await db.insert(kernelRuns).values({
    id: planId,
    goal: params.goal,
    domain: params.domain,
    planType,
    status: "pending",
    dryRun: params.dryRun,
    budget: budget as object,
    policyVersion: policy.id,
  });

  const steps: Step[] = [];
  for (let idx = 0; idx < params.steps.length; idx++) {
    const t = params.steps[idx];
    const stepId = newId("step");
    const idempotencyKey = t.idempotencyKey ?? `${planId}:${idx}:${t.capability}`;
    await db.insert(kernelSteps).values({
      id: stepId,
      runId: planId,
      idx,
      kind: t.kind,
      capability: t.capability,
      input: t.input as object,
      idempotencyKey,
      compensation: (t.compensation as object) ?? null,
      risk: t.risk,
      status: "pending",
      entityKey: t.entityKey ?? null,
    });
    steps.push({
      id: stepId,
      runId: planId,
      idx,
      kind: t.kind,
      capability: t.capability,
      input: t.input,
      idempotencyKey,
      compensation: t.compensation,
      risk: t.risk,
      status: "pending",
      entityKey: t.entityKey,
      attempts: 0,
    });
  }

  await appendEvent({
    type: "run.created",
    actor: params.actor,
    correlationId: planId,
    payload: { goal: params.goal, domain: params.domain, planType, dryRun: params.dryRun, stepCount: steps.length },
    policyVersion: policy.id,
  });

  return { planId, goal: params.goal, domain: params.domain, planType, steps, budget, policySnapshot: policy, dryRun: params.dryRun };
}

export async function hasDryRunRecord(planType: string): Promise<boolean> {
  const [row] = await db.select().from(kernelPlanTypeDryRuns).where(eq(kernelPlanTypeDryRuns.planType, planType)).limit(1);
  return Boolean(row);
}

/** Simulate-before-act: runs dryRun() for every step against the real
 * registry (no mutation) and records that this plan TYPE has a dry-run on
 * file. The kernel (not a policy document) refuses the first LIVE execution
 * of any plan type that lacks this record — see `runCycle` below. */
export async function recordDryRunForPlan(runId: string, actor: Actor): Promise<{ planType: string; diffs: Array<{ stepId: string; capability: string; diff: PredictedDiff }> }> {
  const [run] = await db.select().from(kernelRuns).where(eq(kernelRuns.id, runId)).limit(1);
  if (!run) throw new Error(`Run ${runId} not found`);
  const steps = await db.select().from(kernelSteps).where(eq(kernelSteps.runId, runId)).orderBy(asc(kernelSteps.idx));

  const diffs: Array<{ stepId: string; capability: string; diff: PredictedDiff }> = [];
  for (const step of steps) {
    const cap = requireCapability(step.capability);
    const ctx: CapabilityContext = { actor, domain: run.domain, runId, stepId: step.id, dryRun: true };
    const diff = await cap.dryRun(step.input, ctx);
    await db.update(kernelSteps).set({ predictedDiff: diff as object }).where(eq(kernelSteps.id, step.id));
    await appendEvent({
      type: "step.dry_run",
      actor,
      correlationId: runId,
      causationId: step.id,
      payload: { stepId: step.id, capability: step.capability, diff },
    });
    diffs.push({ stepId: step.id, capability: step.capability, diff });
  }

  await db
    .insert(kernelPlanTypeDryRuns)
    .values({ planType: run.planType, dryRunRunId: runId })
    .onConflictDoUpdate({ target: kernelPlanTypeDryRuns.planType, set: { dryRunRunId: runId, dryRunAt: new Date() } });

  await appendEvent({
    type: "plan.dry_run.recorded",
    actor,
    correlationId: runId,
    payload: { planType: run.planType },
  });

  return { planType: run.planType, diffs };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export interface RunCycleOptions {
  actor?: Actor;
  /** Test-only instrumentation: after the step at this index finishes its
   * capability.execute() side effect, kill this process before the step is
   * marked done or the checkpoint advances — simulating a real mid-run
   * crash. Never set by any API route; only used by scripts/kernel tests. */
  __crashAfterStepIdx?: number;
}

export interface RunCycleResult {
  runId: string;
  status: string;
  haltedReason?: string | null;
}

/** The one and only place steps run. Safe to call repeatedly on the same
 * runId: it is how both "start" and "resume after crash" work. */
export async function runCycle(runId: string, options: RunCycleOptions = {}): Promise<RunCycleResult> {
  const actor: Actor = options.actor ?? { kind: "agent", id: "kernel-scheduler" };

  const [run] = await db.select().from(kernelRuns).where(eq(kernelRuns.id, runId)).limit(1);
  if (!run) throw new Error(`Run ${runId} not found`);

  if (["done", "failed", "reverted"].includes(run.status)) {
    return { runId, status: run.status, haltedReason: run.haltedReason };
  }
  // "halted" (kill-switch stop) is recoverable: if the kill switch has since
  // been disengaged, fall through below and resume from the checkpoint. If
  // it is still engaged, the check immediately below re-halts it.

  if (await isKillSwitchEngaged()) {
    await db.update(kernelRuns).set({ status: "halted", haltedReason: "kill_switch_engaged", updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
    await appendEvent({ type: "run.halted", actor, correlationId: runId, payload: { reason: "kill_switch_engaged" } });
    return { runId, status: "halted", haltedReason: "kill_switch_engaged" };
  }

  if (!run.dryRun && !(await hasDryRunRecord(run.planType))) {
    await db.update(kernelRuns).set({ status: "failed", haltedReason: "no_dry_run_record_for_plan_type", updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
    await appendEvent({
      type: "run.failed",
      actor,
      correlationId: runId,
      payload: { reason: "no_dry_run_record_for_plan_type", planType: run.planType },
    });
    return { runId, status: "failed", haltedReason: "no_dry_run_record_for_plan_type" };
  }

  if (run.status === "pending") {
    await db.update(kernelRuns).set({ status: "running", startedAt: new Date(), updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
    await appendEvent({ type: "run.started", actor, correlationId: runId, payload: { resumed: run.checkpoint > 0 } });
  } else {
    await appendEvent({ type: "run.resumed", actor, correlationId: runId, payload: { fromCheckpoint: run.checkpoint } });
  }

  const steps = await db.select().from(kernelSteps).where(eq(kernelSteps.runId, runId)).orderBy(asc(kernelSteps.idx));

  for (const step of steps) {
    if (step.idx < run.checkpoint) continue;
    if (step.status === "done") {
      await db.update(kernelRuns).set({ checkpoint: step.idx + 1 }).where(eq(kernelRuns.id, runId));
      continue;
    }

    // Kill switch is re-checked before every single step so engaging it
    // halts a running cycle within one tick of this loop, not just at start.
    if (await isKillSwitchEngaged()) {
      await db.update(kernelRuns).set({ status: "halted", haltedReason: "kill_switch_engaged", updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
      await appendEvent({ type: "run.halted", actor, correlationId: runId, causationId: step.id, payload: { reason: "kill_switch_engaged", atStepIdx: step.idx } });
      return { runId, status: "halted", haltedReason: "kill_switch_engaged" };
    }

    const outcome = await runStep(run, step, actor, options);

    if (outcome === "continue") continue;
    return outcome; // run reached a terminal/paused state
  }

  await db.update(kernelRuns).set({ status: "done", completedAt: new Date(), updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
  await appendEvent({ type: "run.completed", actor, correlationId: runId, payload: {} });
  return { runId, status: "done" };
}

type StepOutcome = "continue" | RunCycleResult;

async function runStep(
  run: typeof kernelRuns.$inferSelect,
  stepRow: typeof kernelSteps.$inferSelect,
  actor: Actor,
  options: RunCycleOptions,
): Promise<StepOutcome> {
  const runId = run.id;

  // Unregistered capabilities are structurally impossible to invoke: this
  // throws and is never caught here, by design (fails loudly).
  const cap = requireCapability(stepRow.capability);

  await appendEvent({ type: "step.observed", actor, correlationId: runId, causationId: stepRow.id, payload: { stepId: stepRow.id, capability: stepRow.capability, kind: stepRow.kind } });

  const domainPaused = stepRow.risk !== "read" ? await isDomainPaused(run.domain) : false;

  let budgetOk = true;
  if (stepRow.risk !== "read" && stepRow.attempts === 0) {
    const res = await tryConsumeBudget(run.domain, stepRow.capability, cap.costEstimate(stepRow.input));
    budgetOk = res.ok;
    await appendEvent({ type: "step.budget_checked", actor, correlationId: runId, causationId: stepRow.id, payload: { ok: res.ok, remaining: res.remaining, limit: res.limit } });
  }

  const decision = await evaluateStepPolicy({
    capability: stepRow.capability,
    risk: stepRow.risk as RiskClass,
    domain: run.domain,
    domainPaused,
    budgetOk,
  });

  await appendEvent({ type: "step.policy_evaluated", actor, correlationId: runId, causationId: stepRow.id, payload: decision });

  if (decision.decision === "deny") {
    await db.update(kernelSteps).set({ status: "failed", error: decision.reason, updatedAt: new Date() }).where(eq(kernelSteps.id, stepRow.id));
    await db.update(kernelRuns).set({ status: "failed", haltedReason: decision.reason, updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
    await appendEvent({ type: "run.failed", actor, correlationId: runId, causationId: stepRow.id, payload: { reason: decision.reason } });
    return { runId, status: "failed", haltedReason: decision.reason };
  }

  let effectiveInput = stepRow.input;

  if (decision.decision === "require-approval") {
    const existing = await findApprovalForStep(stepRow.id);
    if (!existing) {
      const ctx: CapabilityContext = { actor, domain: run.domain, runId, stepId: stepRow.id, dryRun: true };
      const predictedDiff = await cap.dryRun(stepRow.input, ctx);
      await createApprovalRequest({
        stepId: stepRow.id,
        runId,
        riskClass: stepRow.risk as RiskClass,
        predictedDiff,
        evidence: { capability: stepRow.capability, input: stepRow.input, attempts: stepRow.attempts },
      });
      await db.update(kernelRuns).set({ status: "awaiting_approval", checkpoint: stepRow.idx, updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
      return { runId, status: "awaiting_approval" };
    }
    if (existing.status === "pending") {
      await db.update(kernelRuns).set({ status: "awaiting_approval", checkpoint: stepRow.idx, updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
      return { runId, status: "awaiting_approval" };
    }
    if (existing.status === "rejected") {
      await db.update(kernelSteps).set({ status: "failed", error: "approval_rejected", updatedAt: new Date() }).where(eq(kernelSteps.id, stepRow.id));
      await db.update(kernelRuns).set({ status: "failed", haltedReason: "approval_rejected", updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
      await appendEvent({ type: "run.failed", actor, correlationId: runId, causationId: stepRow.id, payload: { reason: "approval_rejected" } });
      return { runId, status: "failed", haltedReason: "approval_rejected" };
    }
    if (existing.status === "modified" && existing.modifiedInput) {
      effectiveInput = existing.modifiedInput;
    }
    // approved or modified -> fall through to execution.
  }

  return executeStep(run, stepRow, actor, cap, effectiveInput, options);
}

async function findApprovalForStep(stepId: string) {
  const { db: _db } = await import("@/db");
  const { kernelApprovals } = await import("@/db/schema");
  const { eq: _eq, desc } = await import("drizzle-orm");
  const rows = await _db.select().from(kernelApprovals).where(_eq(kernelApprovals.stepId, stepId)).orderBy(desc(kernelApprovals.requestedAt)).limit(1);
  return rows[0];
}

async function executeStep(
  run: typeof kernelRuns.$inferSelect,
  stepRow: typeof kernelSteps.$inferSelect,
  actor: Actor,
  cap: ReturnType<typeof requireCapability>,
  effectiveInput: unknown,
  options: RunCycleOptions,
): Promise<StepOutcome> {
  const runId = run.id;
  const budget = run.budget as Budget;
  const ctx: CapabilityContext = { actor, domain: run.domain, runId, stepId: stepRow.id, dryRun: run.dryRun };

  if (stepRow.entityKey) {
    try {
      await acquireLock(stepRow.entityKey, runId);
    } catch (err) {
      if (err instanceof LockContentionError) {
        await appendEvent({ type: "step.lock_contention", actor, correlationId: runId, causationId: stepRow.id, payload: { entityKey: stepRow.entityKey, message: err.message } });
        await db.update(kernelSteps).set({ status: "pending", error: "lock_contention", attempts: stepRow.attempts + 1, updatedAt: new Date() }).where(eq(kernelSteps.id, stepRow.id));
        return { runId, status: "awaiting_approval", haltedReason: "lock_contention" };
      }
      throw err;
    }
  }

  await db.update(kernelSteps).set({ status: "running", startedAt: stepRow.startedAt ?? new Date(), updatedAt: new Date() }).where(eq(kernelSteps.id, stepRow.id));
  await appendEvent({ type: "step.started", actor, correlationId: runId, causationId: stepRow.id, payload: { capability: stepRow.capability, dryRun: run.dryRun } });

  try {
    if (run.dryRun) {
      const outcome = await simulateStepInDryRun(run, stepRow, cap, effectiveInput, ctx, actor);
      if (stepRow.entityKey) await releaseLock(stepRow.entityKey, runId);
      return outcome;
    }

    const output = await withTimeout(cap.execute(effectiveInput, ctx), budget.stepTimeoutMs, `step ${stepRow.id}`);
    await appendEvent({ type: "step.tool_call", actor, correlationId: runId, causationId: stepRow.id, payload: { capability: stepRow.capability, input: effectiveInput, output } });

    if (options.__crashAfterStepIdx === stepRow.idx) {
      // Test-only: simulate a real process crash *after* the side effect
      // lands but *before* we persist "done" + advance the checkpoint, to
      // prove resume is driven by durable state, not in-memory progress.
      process.kill(process.pid, "SIGKILL");
    }

    let verified = true;
    if (cap.verify) {
      try {
        verified = await cap.verify(effectiveInput, output, ctx);
      } catch {
        verified = false;
      }
    }
    await appendEvent({ type: "step.verified", actor, correlationId: runId, causationId: stepRow.id, payload: { verified } });

    if (!verified) {
      return failVerification(run, stepRow, actor, cap, effectiveInput, output, ctx);
    }

    await recordCircuitOutcome(stepRow.capability, true);
    await db.update(kernelSteps).set({ status: "done", output: output as object, completedAt: new Date(), updatedAt: new Date() }).where(eq(kernelSteps.id, stepRow.id));
    await db.update(kernelRuns).set({ checkpoint: stepRow.idx + 1, updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
    await appendEvent({ type: "step.done", actor, correlationId: runId, causationId: stepRow.id, payload: { output } });

    if (stepRow.entityKey) await releaseLock(stepRow.entityKey, runId);
    return "continue";
  } catch (err) {
    if (stepRow.entityKey) await releaseLock(stepRow.entityKey, runId);
    return handleTransientFailure(run, stepRow, actor, err);
  }
}

async function simulateStepInDryRun(
  run: typeof kernelRuns.$inferSelect,
  stepRow: typeof kernelSteps.$inferSelect,
  cap: ReturnType<typeof requireCapability>,
  effectiveInput: unknown,
  ctx: CapabilityContext,
  actor: Actor,
): Promise<StepOutcome> {
  const runId = run.id;
  const predictedDiff = await cap.dryRun(effectiveInput, ctx);
  await appendEvent({ type: "step.simulated_execute", actor, correlationId: runId, causationId: stepRow.id, payload: { capability: stepRow.capability, predictedDiff } });

  // A capability's own dryRun() result can be inspected for an injectable,
  // fully-simulated verify failure (no real mutation ever happens here) —
  // this is how the dry-run integration test exercises verify+compensate.
  const simulatedInput = effectiveInput as { forceVerifyFailure?: boolean };
  const willVerify = !simulatedInput?.forceVerifyFailure;
  await appendEvent({ type: "step.verified", actor, correlationId: runId, causationId: stepRow.id, payload: { verified: willVerify, simulated: true } });

  if (!willVerify) {
    let compensationDiff: PredictedDiff | undefined;
    if (stepRow.compensation) {
      const compCap = requireCapability((stepRow.compensation as CompensationHandle).capability);
      compensationDiff = await compCap.dryRun((stepRow.compensation as CompensationHandle).input, ctx);
      await appendEvent({ type: "step.simulated_compensate", actor, correlationId: runId, causationId: stepRow.id, payload: { compensation: stepRow.compensation, compensationDiff } });
    } else if (cap.compensate) {
      await appendEvent({ type: "step.simulated_compensate", actor, correlationId: runId, causationId: stepRow.id, payload: { note: "capability defines compensate(); would be invoked on live revert" } });
    }
    await db.update(kernelSteps).set({ status: "reverted", predictedDiff: predictedDiff as object, error: "simulated_verify_failure", updatedAt: new Date() }).where(eq(kernelSteps.id, stepRow.id));
    await db.update(kernelRuns).set({ status: "reverted", haltedReason: "simulated_verify_failure", checkpoint: stepRow.idx + 1, updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
    await appendEvent({ type: "run.reverted", actor, correlationId: runId, causationId: stepRow.id, payload: { reason: "simulated_verify_failure" } });
    return { runId, status: "reverted", haltedReason: "simulated_verify_failure" };
  }

  await db.update(kernelSteps).set({ status: "done", predictedDiff: predictedDiff as object, output: { dryRun: true } as object, completedAt: new Date(), updatedAt: new Date() }).where(eq(kernelSteps.id, stepRow.id));
  await db.update(kernelRuns).set({ checkpoint: stepRow.idx + 1, updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
  await appendEvent({ type: "step.done", actor, correlationId: runId, causationId: stepRow.id, payload: { dryRun: true, predictedDiff } });
  return "continue";
}

async function failVerification(
  run: typeof kernelRuns.$inferSelect,
  stepRow: typeof kernelSteps.$inferSelect,
  actor: Actor,
  cap: ReturnType<typeof requireCapability>,
  effectiveInput: unknown,
  output: unknown,
  ctx: CapabilityContext,
): Promise<RunCycleResult> {
  const runId = run.id;
  if (cap.compensate) {
    try {
      await cap.compensate(effectiveInput, output, ctx);
      await appendEvent({ type: "step.compensated", actor, correlationId: runId, causationId: stepRow.id, payload: { capability: stepRow.capability } });
      await db.update(kernelSteps).set({ status: "reverted", output: output as object, error: "verify_failed", updatedAt: new Date() }).where(eq(kernelSteps.id, stepRow.id));
      await db.update(kernelRuns).set({ status: "reverted", haltedReason: "verify_failed_compensated", checkpoint: stepRow.idx + 1, updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
      await appendEvent({ type: "run.reverted", actor, correlationId: runId, causationId: stepRow.id, payload: { reason: "verify_failed_compensated" } });
      return { runId, status: "reverted", haltedReason: "verify_failed_compensated" };
    } catch (compErr) {
      await appendEvent({ type: "step.compensation_failed", actor, correlationId: runId, causationId: stepRow.id, payload: { message: String(compErr) } });
    }
  }
  await sendToDeadLetter({ runId, stepId: stepRow.id, reason: "verify_failed_no_compensation", payload: { input: effectiveInput, output } });
  await db.update(kernelSteps).set({ status: "failed", error: "verify_failed_no_compensation", updatedAt: new Date() }).where(eq(kernelSteps.id, stepRow.id));
  await db.update(kernelRuns).set({ status: "failed", haltedReason: "verify_failed_no_compensation", updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
  await appendEvent({ type: "run.failed", actor, correlationId: runId, causationId: stepRow.id, payload: { reason: "verify_failed_no_compensation" } });
  return { runId, status: "failed", haltedReason: "verify_failed_no_compensation" };
}

async function handleTransientFailure(run: typeof kernelRuns.$inferSelect, stepRow: typeof kernelSteps.$inferSelect, actor: Actor, err: unknown): Promise<RunCycleResult> {
  const runId = run.id;
  const attempts = stepRow.attempts + 1;
  const message = err instanceof Error ? err.message : String(err);
  await appendEvent({ type: "step.failed_transient", actor, correlationId: runId, causationId: stepRow.id, payload: { attempts, message } });

  const circuit = await recordCircuitOutcome(stepRow.capability, false);
  if (circuit.tripped) {
    await setCapabilityMode(stepRow.capability, "manual", "circuit-breaker");
    await appendEvent({ type: "circuit_breaker.tripped", actor, correlationId: runId, causationId: stepRow.id, payload: { capability: stepRow.capability, consecutiveFailures: circuit.consecutiveFailures } });
  }

  if (attempts >= MAX_ATTEMPTS) {
    await sendToDeadLetter({ runId, stepId: stepRow.id, reason: message, payload: { input: stepRow.input } });
    await db.update(kernelSteps).set({ status: "failed", error: message, attempts, updatedAt: new Date() }).where(eq(kernelSteps.id, stepRow.id));
    await db.update(kernelRuns).set({ status: "failed", haltedReason: "dead_lettered", updatedAt: new Date() }).where(eq(kernelRuns.id, runId));
    await appendEvent({ type: "run.failed", actor, correlationId: runId, causationId: stepRow.id, payload: { reason: "dead_lettered" } });
    return { runId, status: "failed", haltedReason: "dead_lettered" };
  }

  const delay = backoffWithJitter(attempts, BACKOFF_BASE_MS);
  await db.update(kernelSteps).set({ status: "pending", error: message, attempts, updatedAt: new Date() }).where(eq(kernelSteps.id, stepRow.id));
  await sleep(delay);
  return runCycle(runId, { actor });
}

export async function replayRun(runId: string) {
  const events = await listEvents(runId);
  return events;
}
