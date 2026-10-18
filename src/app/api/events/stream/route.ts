import { pickRuleSubset, runOrchestrator } from "@/lib/orchestrator";
import type { FindingsDeltaEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

const TICK_MS = 10_000;
const HEARTBEAT_MS = 15_000;

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // controller already closed; ignore.
        }
      };

      safeEnqueue(sseFrame("connected", { ok: true, at: new Date().toISOString() }));

      tickTimer = setInterval(async () => {
        try {
          const subset = pickRuleSubset(3);
          const result = await runOrchestrator({ ruleSubset: subset });
          const delta: FindingsDeltaEvent = {
            type: "findings_delta",
            generatedAt: result.generatedAt,
            orgHealthScore: result.orgHealthScore,
            priorOrgHealthScore: result.priorOrgHealthScore,
            domainScores: result.domainScores,
            findings: result.findings,
            ruleEvaluations: result.ruleEvaluations,
            heatmap: result.heatmap,
          };
          safeEnqueue(sseFrame("findings_delta", delta));
        } catch (error) {
          console.error("SSE tick failed", error);
        }
      }, TICK_MS);

      heartbeatTimer = setInterval(() => {
        safeEnqueue(`: heartbeat ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      const abort = () => {
        if (tickTimer) clearInterval(tickTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", abort);
    },
    cancel() {
      if (tickTimer) clearInterval(tickTimer);
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
