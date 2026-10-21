// GET /api/events/poll?lastEventId=
//
// Graceful-degradation path: when SSE is blocked (corporate proxy buffering,
// an intermediary that kills long-lived connections, etc.) the client falls
// back to polling this endpoint on an interval. Same durable source (the
// outbox) and same role scoping as the stream route, so behavior is
// identical from the caller's point of view — just higher latency.

import { resolveCurrentUser } from "@/lib/currentUser";
import { readEventsSince } from "@/lib/eventStore";
import { runDueWork } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  runDueWork().catch(() => {});

  const url = new URL(req.url);
  const lastEventId = Number.parseInt(url.searchParams.get("lastEventId") ?? "0", 10) || 0;
  const frames = await readEventsSince(lastEventId, { roles: [user.role] });

  return Response.json({
    frames: frames.map((f) => ({
      id: f.id,
      type: f.type,
      domain: f.domain,
      entityRef: f.entityRef,
      payload: f.payload,
      createdAt: f.createdAt,
    })),
  });
}
