/**
 * GET /api/events — raw event log (for the Data/event-log view).
 * POST /api/events — append a new "now" event (not backdated/seeded).
 */

import { ensureBaselineData } from "@/lib/seed";
import { load, append } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureBaselineData();
  const events = await load();
  return Response.json({ ok: true, events });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.type || typeof body.type !== "string") {
      return Response.json({ ok: false, error: "type is required" }, { status: 400 });
    }
    const event = await append(body.type, body.data ?? {});
    return Response.json({ ok: true, event });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "invalid request" }, { status: 400 });
  }
}
