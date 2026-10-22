// LEADOS Part 14 — POST /api/dev/emit
// Test/dev-only helper: appends + publishes a frame from WITHIN the running
// server process. Needed because the realtime bus (src/lib/eventBus.ts) is
// in-process — a separate test script process can write to the durable
// outbox directly, but can't trigger the server's live fan-out without going
// through the server itself. Production code should call
// dispatchInterrupt()/appendEvent() from real domain events instead.
import { appendEvent, type FrameType } from "@/lib/eventStore";
import { publishFrame } from "@/lib/eventBus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    orgId: string;
    topic: string;
    type?: FrameType;
    payload?: Record<string, unknown>;
  };

  if (!body.orgId || !body.topic) {
    return Response.json({ error: "orgId and topic are required" }, { status: 400 });
  }

  const frame = await appendEvent({
    orgId: body.orgId,
    topic: body.topic,
    type: body.type ?? "finding",
    payload: body.payload ?? {},
  });
  publishFrame(frame);

  return Response.json({ frame });
}
