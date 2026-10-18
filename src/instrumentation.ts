// Next.js instrumentation hook (stable since Next.js 15). This is what
// gives the autonomous agent a *true* schedule instead of relying solely on
// an on-demand POST from a browser poller: `register()` runs once when the
// Node.js server process boots and starts an interval-based loop that keeps
// running for the lifetime of the process.

const globalForAgent = globalThis as typeof globalThis & {
  __leadosAgentLoopStarted?: boolean;
};

// UNVERIFIED: the task does not specify a concrete schedule interval, only
// that `scheduleLoop(intervalMs)` must exist and be driven by a real timer.
// 15 minutes is a reasonable default cadence for a background
// intelligence sweep; it can be overridden with AGENT_INTERVAL_MS.
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (globalForAgent.__leadosAgentLoopStarted) return;
  if (!process.env.DATABASE_URL) return;

  globalForAgent.__leadosAgentLoopStarted = true;

  const { scheduleLoop } = await import("./lib/autonomousAgent");
  const intervalMs = Number(process.env.AGENT_INTERVAL_MS) || DEFAULT_INTERVAL_MS;

  try {
    scheduleLoop(intervalMs);
    console.log(`[autonomousAgent] schedule started, interval=${intervalMs}ms`);
  } catch (err) {
    console.error("[autonomousAgent] failed to start schedule", err);
  }
}
