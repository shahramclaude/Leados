// Next.js instrumentation hook (runs once per server process on boot).
// Used here purely for graceful shutdown: when the platform sends SIGTERM
// (Docker stop, rolling deploy, Kubernetes pod termination), we flip a flag
// that the composite health check reports as "warn" immediately, so a load
// balancer / orchestrator stops routing new traffic while in-flight
// requests finish. See docs/RUNBOOKS.md → "Maintenance mode & graceful
// shutdown" for the full procedure and its honest limitations (this app has
// no long-running background worker process to "drain" — only in-flight
// HTTP requests, which Node's default server already finishes before
// exiting on SIGTERM as long as the orchestrator gives it a grace period).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { markShuttingDown } = await import("@/lib/health/shutdown");
  const { logger } = await import("@/lib/observability/logger");

  const handleSignal = (signal: NodeJS.Signals) => {
    logger.warn("shutdown_signal_received", { signal });
    markShuttingDown();
  };

  process.once("SIGTERM", () => handleSignal("SIGTERM"));
  process.once("SIGINT", () => handleSignal("SIGINT"));

  logger.info("process_started", { pid: process.pid, nodeVersion: process.version });
}
