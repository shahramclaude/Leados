// GET /api/events/stream
//
// One authenticated SSE stream carrying typed frames (finding, approval,
// work_queue, metric_anomaly, agent_run, notification). See docs/REALTIME.md
// for the full frame-by-frame protocol. Summary of the guarantees this route
// provides:
//
//   - Per-frame id is the outbox row's monotonically increasing bigserial id.
//   - `Last-Event-ID` (header, standard SSE reconnect mechanism) OR a
//     `?lastEventId=` query param (used by environments/tests that cannot
//     set a custom header, e.g. the native browser EventSource API) causes
//     a lossless backfill from the durable outbox before live frames start.
//   - Heartbeats (`: hb` comments) every 15s keep intermediaries from idling
///    the connection out and let clients detect a silently dead connection.
//   - Role-based scoping: only rows whose `visibleRoles` intersects the
//     caller's role are ever written to this connection (Part 09 seam).
//   - Backoff/jitter is a client concern (see useRealtimeIntelligence.ts);
//     this route just needs to be cheap to reconnect to.

import { resolveCurrentUser } from "@/lib/currentUser";
import { readEventsSince, type StreamFrame } from "@/lib/eventStore";
import { subscribe } from "@/lib/eventBus";
import { runDueWork } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

function frameToSSE(frame: StreamFrame): string {
  const data = JSON.stringify({
    type: frame.type,
    domain: frame.domain,
    entityRef: frame.entityRef,
    payload: frame.payload,
    createdAt: frame.createdAt,
  });
  return `id: ${frame.id}\nevent: ${frame.type}\ndata: ${data}\n\n`;
}

export async function GET(req: Request) {
  const user = await resolveCurrentUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const headerLastEventId = req.headers.get("last-event-id");
  const queryLastEventId = url.searchParams.get("lastEventId");
  const lastEventId = Number.parseInt(headerLastEventId ?? queryLastEventId ?? "0", 10) || 0;

  const roles = [user.role];

  // Best-effort, debounced: lets due digests fire even without an external
  // scheduler hitting /api/cron/tick in this sandbox (see scheduler.ts).
  runDueWork().catch(() => {});

  let closed = false;
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          // controller already closed by client disconnect race; ignore
        }
      };

      send(`retry: 2000\n\n`);

      // 1) Lossless backfill from the durable outbox.
      try {
        const backlog = await readEventsSince(lastEventId, { roles });
        for (const frame of backlog) send(frameToSSE(frame));
      } catch {
        send(`event: stream_error\ndata: ${JSON.stringify({ message: "backfill failed" })}\n\n`);
      }

      // 2) Live subscription for anything published after backfill started.
      // A tiny race window between step 1 and step 2 is closed by re-reading
      // the outbox once more for anything created in between.
      let maxSeenId = lastEventId;
      const seen = new Set<number>();

      const emit = (frame: StreamFrame) => {
        if (frame.id <= maxSeenId || seen.has(frame.id)) return;
        if (!frame.visibleRoles.includes("*") && !roles.some((r) => frame.visibleRoles.includes(r))) return;
        seen.add(frame.id);
        maxSeenId = Math.max(maxSeenId, frame.id);
        send(frameToSSE(frame));
      };

      unsubscribe = subscribe(emit);

      try {
        const gapFill = await readEventsSince(maxSeenId, { roles });
        for (const frame of gapFill) emit(frame);
      } catch {
        // non-fatal; live subscription still works, worst case is a short
        // delay until the next heartbeat-triggered client reconnect.
      }

      heartbeat = setInterval(() => send(`: hb ${Date.now()}\n\n`), HEARTBEAT_MS);
    },
    cancel() {
      closed = true;
      if (unsubscribe) unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
