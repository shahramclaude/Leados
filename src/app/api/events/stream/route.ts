// LEADOS Part 14 — SSE stream hub endpoint.
// GET /api/events/stream?userId=...&role=...  (role optional override for demo)
// Resume: send `Last-Event-ID: <id>` header (standard EventSource behavior)
// or `?lastEventId=<id>` query param (for non-EventSource clients / tests).
import { resolveActor } from "@/lib/demoContext";
import { encodeComment, openConnection, type Sink } from "@/lib/streamHub";
import { getLatestFrameId } from "@/lib/eventStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 15000;
// Small queue high-water-mark so the backpressure demo/tests can trip it
// deterministically without needing thousands of frames.
const QUEUE_HIGH_WATER_MARK = 32;

export async function GET(req: Request) {
  const actor = await resolveActor(req);
  const url = new URL(req.url);
  const headerLastId = req.headers.get("last-event-id");
  const queryLastId = url.searchParams.get("lastEventId");
  const rawLastId = headerLastId ?? queryLastId;
  const lastEventId = rawLastId ? BigInt(rawLastId) : null;

  let closed = false;
  let pendingWrites = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      const sink: Sink = {
        write(chunk: string) {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
            pendingWrites += 1;
            // "Drain" bookkeeping: desiredSize goes negative/low when the
            // consumer isn't reading fast enough relative to our queuing
            // strategy high water mark.
            queueMicrotask(() => {
              pendingWrites = Math.max(0, pendingWrites - 1);
            });
          } catch {
            closed = true;
          }
        },
        isBackedUp() {
          const desired = controller.desiredSize;
          if (desired === null) return false;
          return desired <= 0;
        },
        isClosed() {
          return closed;
        },
      };

      sink.write(encodeComment("leados-stream-open"));

      const resolvedLastId = lastEventId ?? (await getLatestFrameId());
      const connection = await openConnection({
        orgId: actor.orgId,
        userId: actor.userId,
        role: actor.role,
        lastEventId,
        sink,
      });
      void resolvedLastId;

      const heartbeat = setInterval(() => {
        if (closed) return;
        sink.write(encodeComment(`heartbeat ${Date.now()}`));
      }, HEARTBEAT_MS);

      const cleanup = () => {
        closed = true;
        clearInterval(heartbeat);
        connection.close();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      closed = true;
    },
  }, new CountQueuingStrategy({ highWaterMark: QUEUE_HIGH_WATER_MARK }));

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
