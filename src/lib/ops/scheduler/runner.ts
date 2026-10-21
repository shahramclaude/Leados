// The scheduler: a single-process interval loop that (1) enqueues scheduled
// jobs when they come due and (2) runs a work-queue worker to process
// whatever is queued. Started once per process from `instrumentation.ts`.
//
// Honest limitation: this is a single-instance scheduler. If the deployment
// is ever scaled to N replicas, only one of them should run this loop (e.g.
// gated by a leader-election row) — tracked, not solved, here.
import { db } from "@/db";
import { automationRuns } from "@/db/schema";
import { enqueue, claimDueJobs, markSucceeded, markFailed } from "@/lib/ops/workQueue";
import { JOB_HANDLERS } from "./jobs";
import { runWithContext, newId } from "@/lib/obs/context";
import { withJobSpan } from "@/lib/obs/tracing";
import { logger } from "@/lib/obs/logger";
import { recordAutomationRun } from "@/lib/obs/metrics";
import { beginTrackingJob, finishTrackingJob, isDraining } from "@/lib/ops/shutdown";

export interface ScheduleDef {
  jobType: string;
  intervalMs: number;
}

// Interval defaults are production-sane; every one is overridable via env so
// this can be demonstrated/tested on a compressed timescale in the sandbox.
export const SCHEDULE: ScheduleDef[] = [
  { jobType: "deadmans.ping", intervalMs: Number(process.env.SCHED_DEADMANS_MS || 60_000) },
  { jobType: "projection.refresh", intervalMs: Number(process.env.SCHED_PROJECTION_MS || 30_000) },
  { jobType: "outbox.dispatch", intervalMs: Number(process.env.SCHED_OUTBOX_MS || 15_000) },
  { jobType: "slo.breach_scan", intervalMs: Number(process.env.SCHED_SLO_SCAN_MS || 300_000) },
  { jobType: "queue.sweep_stale_running", intervalMs: Number(process.env.SCHED_SWEEP_MS || 120_000) },
  { jobType: "backup.nightly", intervalMs: Number(process.env.SCHED_BACKUP_MS || 86_400_000) },
  { jobType: "backup.restore_verify", intervalMs: Number(process.env.SCHED_RESTORE_VERIFY_MS || 86_400_000) },
  { jobType: "slo.report", intervalMs: Number(process.env.SCHED_SLO_REPORT_MS || 86_400_000) },
];

const lastEnqueuedAt = new Map<string, number>();

export async function tickScheduler(): Promise<{ enqueued: string[]; processed: number }> {
  if (isDraining()) return { enqueued: [], processed: 0 };
  const enqueued: string[] = [];
  const now = Date.now();
  for (const def of SCHEDULE) {
    const last = lastEnqueuedAt.get(def.jobType) ?? 0;
    if (now - last >= def.intervalMs) {
      lastEnqueuedAt.set(def.jobType, now);
      await enqueue(def.jobType, { scheduled: true });
      enqueued.push(def.jobType);
    }
  }
  const processed = await runWorkerPass();
  return { enqueued, processed };
}

export async function runWorkerPass(limit = 5): Promise<number> {
  const jobs = await claimDueJobs(limit);
  for (const job of jobs) {
    beginTrackingJob(job.id);
    const correlationId = job.correlationId ?? newId("job-");
    await runWithContext({ correlationId, traceId: newId(), spanId: newId(), route: `job:${job.jobType}` }, async () => {
      const startedAt = new Date();
      const handler = JOB_HANDLERS[job.jobType];
      try {
        if (!handler) throw new Error(`no handler registered for job type ${job.jobType}`);
        const result = await withJobSpan(job.jobType, () => handler(job.payload as Record<string, unknown>));
        await markSucceeded(job.id);
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();
        await db.insert(automationRuns).values({
          jobType: job.jobType,
          status: "succeeded",
          triggeredBy: "scheduler",
          startedAt,
          finishedAt,
          durationMs,
          correlationId,
        });
        recordAutomationRun(job.jobType, "succeeded", durationMs);
        logger.info("job.succeeded", { jobType: job.jobType, id: job.id, durationMs, result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await markFailed(job.id, job.attempts, job.maxAttempts, message);
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();
        await db.insert(automationRuns).values({
          jobType: job.jobType,
          status: "failed",
          triggeredBy: "scheduler",
          startedAt,
          finishedAt,
          durationMs,
          correlationId,
          error: message,
        });
        recordAutomationRun(job.jobType, "failed", durationMs);
        logger.error("job.failed", { jobType: job.jobType, id: job.id, durationMs, error: message });
      } finally {
        finishTrackingJob(job.id);
      }
    });
  }
  return jobs.length;
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startSchedulerLoop(tickMs = Number(process.env.SCHEDULER_TICK_MS || 5000)) {
  if (intervalHandle) return;
  logger.info("scheduler.started", { tickMs, jobTypes: SCHEDULE.map((s) => s.jobType) });
  intervalHandle = setInterval(() => {
    tickScheduler().catch((err) => logger.error("scheduler.tick_failed", { error: err instanceof Error ? err.message : String(err) }));
  }, tickMs);
  if (typeof intervalHandle.unref === "function") intervalHandle.unref();
}

export function stopSchedulerLoop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
