import { db } from "@/db";
import { events } from "@/db/schema";
import { invalidateForecastCache } from "@/lib/forecastCache";
import { getEventsPage } from "@/lib/queries";
import { invalidateStatsCache } from "@/lib/statsCache";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/**
 * Keyset ("seek") pagination over (occurred_at desc, id desc), backed by
 * events_occurred_at_id_idx / events_type_occurred_at_idx /
 * events_severity_occurred_at_idx. Never does OFFSET pagination, which would
 * degrade linearly with table size on a 500k+ row table.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT));
  const cursorOccurredAt = url.searchParams.get("cursorOccurredAt");
  const cursorId = url.searchParams.get("cursorId");
  const type = url.searchParams.get("type");
  const severity = url.searchParams.get("severity");

  const { items, nextCursor } = await getEventsPage({
    limit,
    type,
    severity,
    cursor: cursorOccurredAt && cursorId ? { occurredAt: cursorOccurredAt, id: Number(cursorId) } : null,
  });

  return Response.json({ items, nextCursor, limit });
}

/** Ingest a new event. Demonstrates explicit cache invalidation on write. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const types = ["lead.created", "lead.converted", "risk.flag", "deal.won", "deal.lost", "churn.signal"];
  const severities = ["info", "warning", "critical"];

  const type = typeof body.type === "string" ? body.type : types[Math.floor(Math.random() * types.length)];
  const severity =
    typeof body.severity === "string" ? body.severity : severities[Math.floor(Math.random() * severities.length)];

  const [inserted] = await db
    .insert(events)
    .values({
      type,
      severity,
      source: "api.manual",
      entityId: typeof body.entityId === "string" ? body.entityId : null,
      value: String(body.value ?? Math.round(Math.random() * 1000)),
      metadata: body.metadata ?? {},
    })
    .returning();

  // Explicit invalidation: new data exists, cached projections are now stale.
  invalidateForecastCache();
  invalidateStatsCache();

  return Response.json({ item: inserted }, { status: 201 });
}
