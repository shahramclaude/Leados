// Next.js instrumentation hook (stable since Next 15): runs once when the
// server process starts, in the nodejs runtime only. This is where the
// scheduler loop and the graceful-shutdown signal handlers are wired up —
// there is no separate worker process in this deployment, by design (see
// docs/DEPLOYMENT.md).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_SCHEDULER === "1") return;

  const { startSchedulerLoop } = await import("@/lib/ops/scheduler/runner");
  const { drain } = await import("@/lib/ops/shutdown");
  const { logger } = await import("@/lib/obs/logger");
  const { pool } = await import("@/db");

  startSchedulerLoop();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("process.shutdown_signal_received", { signal });
    const { stopSchedulerLoop } = await import("@/lib/ops/scheduler/runner");
    stopSchedulerLoop();
    const graceMs = Number(process.env.SHUTDOWN_GRACE_MS || 10_000);
    const result = await drain({ graceMs });
    logger.info("process.drain_result", result as unknown as Record<string, unknown>);
    await pool.end().catch(() => undefined);
    process.exit(result.ok ? 0 : 1);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
