import { appendEvent, listEvents } from "@/lib/eventStore";
import type { Domain } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await listEvents();
    return Response.json({ events });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (Array.isArray(body)) {
      const results = [];
      for (const e of body) {
        results.push(
          await appendEvent({
            type: e.type,
            domain: (e.domain ?? "execution") as Domain,
            entityId: e.entityId ?? null,
            ts: e.ts ?? new Date().toISOString(),
            data: e.data ?? {},
            source: e.source ?? "user",
          })
        );
      }
      return Response.json({ events: results });
    }
    const event = await appendEvent({
      type: body.type,
      domain: (body.domain ?? "execution") as Domain,
      entityId: body.entityId ?? null,
      ts: body.ts ?? new Date().toISOString(),
      data: body.data ?? {},
      source: body.source ?? "user",
    });
    return Response.json({ event });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
