// src/instrumentation.ts
//
// Starts the autonomous agent scheduler once per server process. Next.js
// calls `register()` a single time when the server boots (Node.js runtime
// only — guarded below since this file also loads under the edge runtime
// during build analysis).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AGENT_SCHEDULER_DISABLED === "true") return;

  const globalForScheduler = globalThis as typeof globalThis & {
    __leadosAgentSchedulerStarted?: boolean;
  };
  if (globalForScheduler.__leadosAgentSchedulerStarted) return;
  globalForScheduler.__leadosAgentSchedulerStarted = true;

  const { db } = await import("@/db");
  const { start, DEFAULT_SCHEDULER_CONFIG } = await import("@/lib/agentScheduler");

  try {
    start(DEFAULT_SCHEDULER_CONFIG, db);
    console.log("[instrumentation] autonomous agent scheduler started");
  } catch (err) {
    console.error("[instrumentation] failed to start autonomous agent scheduler", err);
  }
}
