// GET /api/dev/metrics — TEST/DEMO SUPPORT ONLY.
//
// Exposes process-level resource numbers (memory, live SSE subscriber
// count) so the connection-storm test can report real figures instead of
// guessing. Not a general-purpose ops metrics endpoint (no auth needed for
// this sandbox's purposes, but it leaks process internals — remove or lock
// down before any real deployment, same posture as the other /api/dev/*
// routes).

import { listenerCount } from "@/lib/eventBus";

export const dynamic = "force-dynamic";

export async function GET() {
  const mem = process.memoryUsage();
  return Response.json({
    rssMb: Number((mem.rss / 1024 / 1024).toFixed(1)),
    heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(1)),
    externalMb: Number((mem.external / 1024 / 1024).toFixed(1)),
    liveStreamSubscribers: listenerCount(),
    uptimeSec: Math.round(process.uptime()),
  });
}
