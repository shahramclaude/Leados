import { subscribeStreamEvents, type StreamEvent } from "@/lib/eventBus";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

/**
 * Live server push channel for the background intelligence layer.
 *
 * Emits three named SSE event types — `finding`, `work_item`, and
 * `notification` — plus a generic `run` event when a full autonomous cycle
 * completes. A heartbeat comment line is sent every 15s to keep
 * intermediary proxies from closing the connection; the client (see
 * ProactiveRail) reconnects automatically on any drop.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const sendEvent = (event: StreamEvent) => {
        safeEnqueue(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      };

      // Initial hello so the client can distinguish "connected" from "never connected".
      safeEnqueue(`event: connected\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);

      unsubscribe = subscribeStreamEvents(sendEvent);

      heartbeat = setInterval(() => {
        safeEnqueue(`: ping ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      const onAbort = () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", onAbort);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
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
