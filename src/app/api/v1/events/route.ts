import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { withApiRoute } from "@/lib/api/handler";
import { decodeCursor, paginate, parseLimit } from "@/lib/api/pagination";
import { buildFilterConditions, EVENT_FILTER_WHITELIST } from "@/lib/api/resourceFilters";
import { jsonOk } from "@/lib/api/respond";
import { serializeEvent } from "@/lib/api/serializers";
import { parseSort } from "@/lib/api/sorting";

export const GET = withApiRoute("events:read", async (req, ctx) => {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams);
  const sort = parseSort(url.searchParams, ["createdAt"], { field: "createdAt", direction: "desc" });
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const filters = buildFilterConditions(url.searchParams, EVENT_FILTER_WHITELIST, {
    type: events.type,
    createdAt: events.createdAt,
  });
  const conditions = [eq(events.orgId, ctx.auth.orgId), ...filters];
  const op = sort.direction === "desc" ? lt : gt;
  if (cursor) {
    conditions.push(
      or(op(events.createdAt, new Date(cursor.v)), and(eq(events.createdAt, new Date(cursor.v)), op(events.id, cursor.id)))!,
    );
  }
  const dir = sort.direction === "desc" ? desc : asc;
  const rows = await db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(dir(events.createdAt), dir(events.id))
    .limit(limit + 1);
  const serialized = rows.map(serializeEvent);
  const { page, meta } = paginate(serialized, limit, "createdAt", "id");
  return jsonOk({ data: page, meta }, ctx.correlationId, { rateLimit: ctx.rateLimit });
});
