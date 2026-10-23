// LEADOS Agent Kernel — background worker.
//
// This is the ONLY code path that calls the Executor. API route handlers
// never execute plans inline (see src/app/api/agent/runs/route.ts) — they
// only enqueue via orchestrator.createAndEnqueueRun, leaving status
// 'queued'. A persistent poll loop (started once at process boot from
// src/instrumentation.ts) calls `tick()` on an interval; the eval harness
// (scripts/eval-agent.ts) and the test suite call `tick()` directly in a
// tight loop instead of waiting on the interval, since both run in the same
// Node process against the same Postgres instance.
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns, approvals } from "@/db/schema";
import { SystemClock, type Clock } from "./clock";
import { reviewAndMaybeReplan } from "./critic";
import { abortRunDueToRejectedApproval, computeAndStoreReplayHash, runOrResumeRun } from "./executor";

const ACTIVE_STATUSES = ["queued", "running"] as const;
const MAX_PASSES_PER_RUN = 5;

async function driveRunToStableState(runId: string, clock: Clock): Promise<void> {
  for (let pass = 0; pass < MAX_PASSES_PER_RUN; pass++) {
    const result = await runOrResumeRun(runId, clock);
    if (result.verdict === "success") {
      const outcome = await reviewAndMaybeReplan(runId, clock);
      if (outcome.kind === "replanning") continue;
      await computeAndStoreReplayHash(runId);
      return;
    }
    // aborted | awaiting_approval both terminate this pass.
    if (result.verdict === "aborted") {
      await computeAndStoreReplayHash(runId);
    }
    return;
  }
}

export async function tick(clock: Clock = new SystemClock()): Promise<{ processed: number }> {
  let processed = 0;

  const active = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(inArray(agentRuns.status, ACTIVE_STATUSES as unknown as string[]));
  for (const row of active) {
    await driveRunToStableState(row.id, clock);
    processed++;
  }

  const waiting = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.status, "awaiting_approval"));
  for (const row of waiting) {
    const rejected = await db
      .select()
      .from(approvals)
      .where(eq(approvals.runId, row.id));
    const hasRejected = rejected.some((a) => a.status === "rejected");
    if (hasRejected) {
      await abortRunDueToRejectedApproval(row.id, clock);
      await computeAndStoreReplayHash(row.id);
      processed++;
      continue;
    }
    const hasApproved = rejected.some((a) => a.status === "approved");
    if (hasApproved) {
      await driveRunToStableState(row.id, clock);
      processed++;
    }
  }

  return { processed };
}

let loopHandle: ReturnType<typeof setInterval> | null = null;

export function startBackgroundWorkerLoop(intervalMs = 2000): void {
  if (loopHandle) return; // singleton guard — never start twice per process
  loopHandle = setInterval(() => {
    tick().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[agent-worker] tick failed", err);
    });
  }, intervalMs);
  if (typeof loopHandle === "object" && "unref" in loopHandle) {
    (loopHandle as NodeJS.Timeout).unref();
  }
}

export function stopBackgroundWorkerLoopForTests(): void {
  if (loopHandle) {
    clearInterval(loopHandle);
    loopHandle = null;
  }
}
