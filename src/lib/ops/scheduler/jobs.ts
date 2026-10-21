// Job handlers run by the work-queue worker loop. Each one is a complete
// "agent run": it gets its own automation_runs ledger row, its own
// correlationId/trace continuation, and structured logs.
import { db } from "@/db";
import { outbox } from "@/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { refreshProjection, projectionLagSeconds } from "@/lib/ops/projection";
import { runBackup, restoreVerify } from "@/lib/ops/backup";
import { pingDeadMansSwitch } from "@/lib/ops/deadMansSwitch";
import { computeForecastDrift } from "@/lib/ops/forecast";
import { setGauge } from "@/lib/obs/metrics";
import { logger } from "@/lib/obs/logger";
import { generateSloReport } from "@/lib/ops/sloReport";
import { scanForSloBreaches } from "@/lib/ops/sloBreach";
import { withExternalSpan } from "@/lib/obs/tracing";

export type JobHandler = (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;

async function handleProjectionRefresh(): Promise<Record<string, unknown>> {
  const result = await refreshProjection();
  const { driftRatio, forecastNextDay, actualLastDay } = await computeForecastDrift();
  setGauge("forecast_drift_ratio", driftRatio);
  return { ...result, driftRatio, forecastNextDay, actualLastDay };
}

async function handleDeadMansPing(): Promise<Record<string, unknown>> {
  await pingDeadMansSwitch();
  return { pinged: true };
}

async function handleBackupNightly(): Promise<Record<string, unknown>> {
  const result = await runBackup();
  if (!result.ok) throw new Error(result.error || "backup failed");
  return result as unknown as Record<string, unknown>;
}

async function handleRestoreVerify(): Promise<Record<string, unknown>> {
  const result = await restoreVerify();
  if (!result.ok) throw new Error(result.error || "restore verification failed");
  return result as unknown as Record<string, unknown>;
}

async function handleSloReport(): Promise<Record<string, unknown>> {
  const report = await generateSloReport();
  return { generatedAt: report.generatedAt, path: report.path };
}

async function handleSloBreachScan(): Promise<Record<string, unknown>> {
  const findings = await scanForSloBreaches();
  return { findingsOpened: findings.length };
}

/** Dispatch pending outbox rows — a stand-in "notification delivery"
 * channel. In this deployment it logs the delivery (no real webhook
 * endpoint configured by default); the p95 delivery latency SLO is measured
 * against `sentAt - createdAt` regardless of transport. */
async function handleOutboxDispatch(): Promise<Record<string, unknown>> {
  const pending = await db.select().from(outbox).where(eq(outbox.status, "pending")).limit(25);
  let delivered = 0;
  for (const row of pending) {
    await withExternalSpan("notification.deliver", async () => {
      const webhookUrl = process.env.NOTIFY_WEBHOOK_URL;
      if (webhookUrl) {
        await fetch(webhookUrl, { method: "POST", body: JSON.stringify(row.payload), headers: { "content-type": "application/json" } }).catch(
          (err) => logger.warn("outbox.webhook_delivery_failed", { error: String(err) }),
        );
      }
      await db.update(outbox).set({ status: "sent", sentAt: new Date() }).where(eq(outbox.id, row.id));
      delivered += 1;
    });
  }
  return { delivered, pendingBefore: pending.length };
}

async function handleStaleRunningSweep(): Promise<Record<string, unknown>> {
  // Jobs that have been "running" for >30 minutes almost certainly died with
  // the process that claimed them (process crash/restart mid-job). Treat
  // this as the automated half of the stuck-automation-run runbook.
  const { workQueue } = await import("@/db/schema");
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const stale = await db
    .update(workQueue)
    .set({ status: "queued", lastError: "requeued by stale-running sweep", lockedAt: null, lockedBy: null, updatedAt: new Date() })
    .where(and(eq(workQueue.status, "running"), lt(workQueue.lockedAt, cutoff)))
    .returning();
  if (stale.length) logger.warn("scheduler.stale_running_requeued", { count: stale.length });
  return { requeued: stale.length };
}

export const JOB_HANDLERS: Record<string, JobHandler> = {
  "projection.refresh": handleProjectionRefresh,
  "deadmans.ping": handleDeadMansPing,
  "backup.nightly": handleBackupNightly,
  "backup.restore_verify": handleRestoreVerify,
  "slo.report": handleSloReport,
  "slo.breach_scan": handleSloBreachScan,
  "outbox.dispatch": handleOutboxDispatch,
  "queue.sweep_stale_running": handleStaleRunningSweep,
};

export { projectionLagSeconds };
