// src/app/api/events/stream/route.ts
//
// Server-Sent Events stream for the Unified Intelligence Core.
//
// UNVERIFIED-PRIOR-STATE: the task brief describes this as an existing file
// to "upgrade", but no such file existed in this sandbox's repository (see
// orchestrator.ts header for the full provenance note). This is a new
// implementation built to the brief's contract: run orchestration on an
// interval, diff the resulting findings against the previously cached
// result, and push only the delta as `{ event: "findings_delta", data: [...] }`.
//
// Connection management:
//   - One polling/orchestration interval per connection.
//   - A separate, lighter heartbeat comment keeps intermediaries (proxies,
//     browsers) from timing out the connection when there is no delta.
//   - `request.signal`'s abort event (fired when the client disconnects)
//     tears down both intervals and closes the controller so no timers
//     leak across requests.
import { db } from "@/db";
import { cacheOrchestratorResult, getLatestOrchestratorResult, runFullOrchestration } from "@/lib/orchestrator";
import type { Finding } from "@/lib/types";

export const dynamic = "force-dynamic";

const ORCHESTRATION_INTERVAL_MS = 15_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

function diffFindings(previous: Finding[], next: Finding[]): Finding[] {
  const previousById = new Map(previous.map((f) => [f.id, f]));
  const delta: Finding[] = [];
  for (const finding of next) {
    const prior = previousById.get(finding.id);
    if (!prior || prior.severity !== finding.severity || prior.active !== finding.active || prior.message !== finding.message) {
      delta.push(finding);
    }
  }
  return delta;
}

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  let orchestrationTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let isRunning = false;
  let closed = false;
  let previousFindings: Finding[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed (client disconnected mid-write); ignore.
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (orchestrationTimer) clearInterval(orchestrationTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          // Already closed; nothing to do.
        }
      };

      request.signal.addEventListener("abort", cleanup);

      // Seed from the last cached result (if any) so the first orchestration
      // run only reports a delta for genuinely new/changed findings rather
      // than re-announcing the whole org state.
      try {
        const cached = await getLatestOrchestratorResult(db);
        if (cached) {
          previousFindings = cached.intelligence.ruleEvaluation.findings;
          safeEnqueue(sseEncode("snapshot", { result: cached }));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[api/events/stream] failed to load initial snapshot: ${message}`);
      }

      const runOrchestrationTick = async () => {
        if (isRunning || closed) return;
        isRunning = true;
        try {
          const result = await runFullOrchestration(db, new Date());
          await cacheOrchestratorResult(db, result);
          const nextFindings = result.intelligence.ruleEvaluation.findings;
          const delta = diffFindings(previousFindings, nextFindings);
          previousFindings = nextFindings;
          if (delta.length > 0) {
            safeEnqueue(sseEncode("findings_delta", delta));
          }
          safeEnqueue(sseEncode("org_health", { orgHealthScore: result.orgHealthScore, generatedAt: result.generatedAt }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[api/events/stream] orchestration tick failed: ${message}`);
          safeEnqueue(sseEncode("error", { message }));
        } finally {
          isRunning = false;
        }
      };

      // Kick off an immediate run so new connections don't wait a full
      // interval before seeing fresh data, then continue on a timer.
      void runOrchestrationTick();
      orchestrationTimer = setInterval(() => {
        void runOrchestrationTick();
      }, ORCHESTRATION_INTERVAL_MS);

      heartbeatTimer = setInterval(() => {
        safeEnqueue(`: heartbeat ${new Date().toISOString()}\n\n`);
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      closed = true;
      if (orchestrationTimer) clearInterval(orchestrationTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
