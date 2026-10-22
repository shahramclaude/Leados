import { NextResponse } from "next/server";
import { db } from "@/db";
import { workQueueJobs } from "@/db/schema";
import { and, asc, eq, lte } from "drizzle-orm";
import { withRoute } from "@/lib/withRoute";
import { withSpan } from "@/lib/tracing";
import { logger } from "@/lib/logger";
import { registry } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const log = logger.child({ component: "work-queue-worker" });

// A single worker "tick": claims the oldest pending job and processes it.
// Jobs whose payload.failAlways === true simulate a permanently broken job so
// the dead-letter path (and docs/RUNBOOKS.md#dead-letter-triage) is exercisable
// on demand.
export const POST = withRoute(async () => {
  const [job] = await db
    .select()
    .from(workQueueJobs)
    .where(and(eq(workQueueJobs.status, "pending"), lte(workQueueJobs.availableAt, new Date())))
    .orderBy(asc(workQueueJobs.availableAt))
    .limit(1);

  if (!job) {
    return NextResponse.json({ processed: false, reason: "no pending jobs" });
  }

  await db
    .update(workQueueJobs)
    .set({ status: "processing", claimedAt: new Date(), updatedAt: new Date() })
    .where(eq(workQueueJobs.id, job.id));

  const result = await withSpan("process-job", "repo", async () => {
    const payload = job.payload as Record<string, unknown>;
    const shouldFail = payload?.failAlways === true;
    if (shouldFail) throw new Error("simulated permanent job failure");
    return { ok: true };
  }).catch((err: unknown) => ({ ok: false, error: String(err) }));

  const attempts = job.attempts + 1;

  if (result.ok) {
    await db
      .update(workQueueJobs)
      .set({ status: "done", finishedAt: new Date(), attempts, updatedAt: new Date() })
      .where(eq(workQueueJobs.id, job.id));
    registry.agentRunOutcomesTotal.inc({ kind: job.kind, outcome: "succeeded" });
    log.info("work_queue.job_done", { jobId: job.id, attempts });
    return NextResponse.json({ processed: true, jobId: job.id, outcome: "done", attempts });
  }

  const isDead = attempts >= job.maxAttempts;
  await db
    .update(workQueueJobs)
    .set({
      status: isDead ? "dead_letter" : "pending",
      attempts,
      lastError: "error" in result ? result.error : "unknown error",
      availableAt: isDead ? job.availableAt : new Date(Date.now() + 5_000),
      finishedAt: isDead ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(workQueueJobs.id, job.id));
  registry.agentRunOutcomesTotal.inc({ kind: job.kind, outcome: isDead ? "dead_letter" : "retrying" });
  log.warn("work_queue.job_failed", { jobId: job.id, attempts, deadLetter: isDead });
  return NextResponse.json({
    processed: true,
    jobId: job.id,
    outcome: isDead ? "dead_letter" : "retry_scheduled",
    attempts,
  });
});
