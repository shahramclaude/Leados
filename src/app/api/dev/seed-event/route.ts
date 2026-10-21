// POST /api/dev/seed-event — TEST/DEMO SUPPORT ONLY.
//
// Appends a raw frame to the outbox from inside the running server process
// (so the in-memory eventBus fan-out — scoped to this one process — actually
// fires for already-open SSE connections being driven by the test suite).
// This is not a customer-facing feature. Gated by TEST_EVENTS_SECRET when
// that env var is set; open by default in this sandbox so the acceptance
// tests in scripts/tests/ can run without extra configuration. A real
// deployment should set TEST_EVENTS_SECRET (or remove this route) before
// going live — called out explicitly in docs/REALTIME.md and the honesty
// section of the verification log.

import { appendEvent, type StreamEventType } from "@/lib/eventStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.TEST_EVENTS_SECRET;
  if (secret && req.headers.get("x-test-secret") !== secret) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.domain || !body?.type) {
    return Response.json({ error: "domain and type are required" }, { status: 400 });
  }

  const frame = await appendEvent({
    type: body.type as StreamEventType,
    domain: body.domain,
    entityRef: body.entityRef ?? null,
    payload: body.payload ?? {},
    visibleRoles: body.visibleRoles ?? ["admin"],
  });

  return Response.json({ frame });
}
