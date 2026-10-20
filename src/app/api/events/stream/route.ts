// Unified SSE event stream — one channel per authenticated user.
// Protocol documented in full at docs/REALTIME.md.
//
// - `id:` on every frame is the durable, monotonic `events.id` → clients set
//   `Last-Event-ID` (native `EventSource` behaviour) on reconnect and we
//   replay everything after it from Postgres before attaching live.
// - `event: heartbeat` comment frames keep intermediaries from idling the
//   connection out and let the client detect a silent drop.
// - `?domains=a,b` scopes the subscription to a subset of domains (still the
//   same per-user channel — filtering happens server-side before writing).

import { getCurrentUserId } from "@/lib/auth";
import { getEventsSince, subscribe, type RealtimeEvent } from "@/lib/eventBus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 15_000;

function frame(event: RealtimeEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: Request) {
  const userId = await getCurrentUserId(request);
  const url = new URL(request.url);
  const domainFilter = url.searchParams.get("domains")?.split(",").map((d) => d.trim()).filter(Boolean) ?? null;

  const lastEventIdHeader = request.headers.get("last-event-id") ?? url.searchParams.get("lastEventId");
  const lastEventId = lastEventIdHeader ? Number(lastEventIdHeader) : 0;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const passesFilter = (event: RealtimeEvent) => !domainFilter || domainFilter.includes(event.domain);

      // Tell the client which connection it has and let it know resume
      // point semantics up front (retry hint in ms for its backoff).
      safeEnqueue(`retry: 2000\n`);
      safeEnqueue(`event: connected\ndata: ${JSON.stringify({ userId, resumedFrom: lastEventId })}\n\n`);

      // 1. Replay anything durable the client missed (resume semantics).
      const missed = await getEventsSince(userId, lastEventId);
      for (const event of missed) {
        if (passesFilter(event)) safeEnqueue(frame(event));
      }

      // 2. Attach to the live channel for anything new.
      unsubscribe = subscribe(userId, (event) => {
        if (passesFilter(event)) safeEnqueue(frame(event));
      });

      // 3. Heartbeats keep the connection alive and let clients detect drops.
      heartbeat = setInterval(() => {
        safeEnqueue(`: heartbeat ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
