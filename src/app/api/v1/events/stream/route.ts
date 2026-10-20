// Realtime API: Server-Sent Events with resume semantics. Clients can pass
// `?after=<seq>` (or the standard `Last-Event-ID` header) to resume exactly
// where they left off after a disconnect, without missing or duplicating
// events. Requires the `realtime` scope.
import { authenticateAndAuthorize } from "@/lib/platform/auth";
import { ApiError, errorResponse, newCorrelationId } from "@/lib/platform/envelope";
import { listEventsSince } from "@/lib/platform/events";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 1000;
const HEARTBEAT_MS = 15000;

export async function GET(req: Request) {
  const correlationId = newCorrelationId();
  let ctx;
  try {
    ({ ctx } = await authenticateAndAuthorize(req, "realtime"));
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(err, correlationId);
    return errorResponse(new ApiError("INTERNAL_ERROR", "Unexpected error"), correlationId);
  }

  const url = new URL(req.url);
  const afterParam = url.searchParams.get("after") ?? req.headers.get("last-event-id");
  let cursor = afterParam ? Number.parseInt(afterParam, 10) : 0;
  if (!Number.isFinite(cursor)) cursor = 0;

  const orgId = ctx.orgId;
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventId: number, data: unknown) => {
        controller.enqueue(encoder.encode(`id: ${eventId}\nevent: message\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, HEARTBEAT_MS);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        clearInterval(poll);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      const poll = setInterval(async () => {
        if (closed) return;
        try {
          const events = await listEventsSince(orgId, cursor, 50);
          for (const event of events) {
            cursor = event.seq;
            send(event.seq, {
              id: event.id,
              type: event.type,
              orgId: event.orgId,
              createdAt: event.createdAt.toISOString(),
              data: event.payload,
            });
          }
        } catch (err) {
          console.error("event stream poll failed", err);
        }
      }, POLL_INTERVAL_MS);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Correlation-Id": correlationId,
      "X-Accel-Buffering": "no",
    },
  });
}
