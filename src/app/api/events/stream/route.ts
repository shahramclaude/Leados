import { logDuration } from "@/lib/apiUtils";

export const dynamic = "force-dynamic";

const ROUTE = "api/events/stream";
const HEARTBEAT_MS = 15_000;

/**
 * Minimal Server-Sent-Events endpoint. Pushes a `connected` event immediately
 * and a `heartbeat` event on an interval, so clients (see useOrchestrator)
 * can show a live/offline indicator without needing a message broker.
 */
export async function GET() {
  const start = Date.now();
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`)
      );
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`event: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`)
          );
        } catch {
          clearInterval(heartbeat);
        }
      }, HEARTBEAT_MS);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  logDuration(ROUTE, start);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
