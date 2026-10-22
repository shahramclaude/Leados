import { authenticate, rateLimitKeyFor, type Scope } from "@/lib/api/auth";
import { getOrCreateCorrelationId } from "@/lib/api/correlation";
import { ApiError } from "@/lib/api/errors";
import { takeToken } from "@/lib/api/rateLimit";
import { jsonFromCaught, baseHeaders } from "@/lib/api/respond";
import { eventBus, type BusEvent } from "@/lib/events/bus";

export const dynamic = "force-dynamic";

/** Maps a caller's scopes to the event types they are allowed to receive on the public stream. */
const SCOPE_EVENT_MAP: Record<Scope, string[]> = {
  "leads:read": ["lead.created", "lead.updated"],
  "leads:write": [],
  "contacts:read": [],
  "contacts:write": [],
  "deals:read": ["deal.won"],
  "deals:write": [],
  "webhooks:read": [],
  "webhooks:write": [],
  "automation:read": ["automation.run.completed"],
  "automation:write": [],
  admin: ["lead.created", "lead.updated", "deal.won", "automation.run.completed"],
};

const HEARTBEAT_MS = 15_000;

/**
 * Public realtime stream (Server-Sent Events). Scoped: callers only receive
 * event types their API key's scopes permit (same scope model as the REST
 * surface — no separate realtime ACL to drift out of sync).
 */
export async function GET(req: Request) {
  const correlationId = getOrCreateCorrelationId(req);
  try {
    const key = await authenticate(req);
    const rl = takeToken(rateLimitKeyFor(key));
    if (!rl.allowed) {
      return jsonFromCaught(new ApiError("RATE_LIMITED"), correlationId, rl);
    }

    const allowedTypes = new Set(
      key.isAdmin || key.scopes.includes("admin")
        ? Object.values(SCOPE_EVENT_MAP).flat()
        : key.scopes.flatMap((s) => SCOPE_EVENT_MAP[s] ?? []),
    );

    const encoder = new TextEncoder();
    let heartbeat: ReturnType<typeof setInterval>;
    let listener: (evt: BusEvent) => void;

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ correlationId })}\n\n`));

        listener = (evt) => {
          if (!allowedTypes.has(evt.type)) return;
          controller.enqueue(encoder.encode(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\nid: ${evt.id}\n\n`));
        };
        eventBus.on("event", listener);

        heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(`: heartbeat ${new Date().toISOString()}\n\n`));
        }, HEARTBEAT_MS);
      },
      cancel() {
        clearInterval(heartbeat);
        eventBus.off("event", listener);
      },
    });

    return new Response(stream, {
      headers: {
        ...baseHeaders(correlationId),
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return jsonFromCaught(err, correlationId);
  }
}
