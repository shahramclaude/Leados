import { authenticate, requireScope } from "@/lib/api/auth";
import { getCorrelationId } from "@/lib/api/context";
import { toErrorResponse } from "@/lib/api/respond";
import { replayEventsSince, subscribeToStream } from "@/lib/api/stream";

export const dynamic = "force-dynamic";

// Public realtime API (Section D): Server-Sent Events, resumable via
// `?cursor=<seq>`. On connect the handler replays everything with
// `seq > cursor` from the durable `events` table before attaching the live
// feed, so a reconnecting consumer never misses an event (bounded by
// retention). Requires `stream:read` scope like any other read endpoint —
// SSE does not get a free pass on auth just because it is a GET.
export async function GET(req: Request) {
  const correlationId = getCorrelationId(req);
  try {
    const auth = await authenticate(req);
    requireScope(auth, "stream:read");
    const url = new URL(req.url);
    const cursorParam = url.searchParams.get("cursor");
    const sinceSeq = cursorParam ? Number(cursorParam) : 0;

    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: { seq: number; id: string; type: string; payload: unknown; createdAt: string }) => {
          const chunk = `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        };

        controller.enqueue(encoder.encode(`event: stream.connected\ndata: ${JSON.stringify({ correlationId })}\n\n`));

        const backlog = await replayEventsSince(auth.orgId, sinceSeq);
        for (const row of backlog) {
          send({ seq: row.seq, id: row.id, type: row.type, payload: row.payload, createdAt: row.createdAt.toISOString() });
        }

        unsubscribe = subscribeToStream(auth.orgId, send);

        const heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        }, 15000);

        req.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          unsubscribe?.();
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
      },
      cancel() {
        unsubscribe?.();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Correlation-Id": correlationId,
      },
    });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
