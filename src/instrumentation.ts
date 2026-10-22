// Next.js instrumentation hook — runs once when the server process starts.
// Used here to emit a periodic stream-hub heartbeat (consumed by the
// stream_hub health check and the graceful-shutdown drain poll) and to log a
// single structured startup line.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { heartbeatStreamHub } = await import("@/lib/eventBus");
  const { logger } = await import("@/lib/logger");

  const log = logger.child({ component: "instrumentation" });
  log.info("server.start", { pid: process.pid, env: process.env.NODE_ENV });

  const globalForHeartbeat = globalThis as typeof globalThis & {
    __leadosHeartbeatInterval?: NodeJS.Timeout;
  };

  if (!globalForHeartbeat.__leadosHeartbeatInterval) {
    globalForHeartbeat.__leadosHeartbeatInterval = setInterval(() => {
      heartbeatStreamHub().catch((err) => log.warn("heartbeat.failed", { error: String(err) }));
    }, 15_000);
    // Don't let the heartbeat timer keep the process alive on its own during shutdown.
    globalForHeartbeat.__leadosHeartbeatInterval.unref?.();
    heartbeatStreamHub().catch((err) => log.warn("heartbeat.failed", { error: String(err) }));
  }
}
