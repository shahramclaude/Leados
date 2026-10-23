// Next.js instrumentation hook — boots the Agent Kernel's background worker
// loop exactly once per server process. This is what makes "execution is
// queued, never in a request handler" true: API routes only ever insert a
// 'queued' row; this loop is the only thing that advances it.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackgroundWorkerLoop } = await import("./lib/agent/worker");
    startBackgroundWorkerLoop(2000);
  }
}
