import { NextResponse } from "next/server";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 200;

/**
 * Admin event-log browser API: filter by type / actor / time window, bounded
 * pagination (never an unbounded `select()`). Powers src/app/admin/events.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ ok: false, error: { code: "invalid", message: "orgId is required" } }, { status: 400 });
  }

  const eventType = url.searchParams.get("eventType");
  const entityType = url.searchParams.get("entityType");
  const actorId = url.searchParams.get("actorId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const beforeSeq = url.searchParams.get("beforeSeq");
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(limitRaw) ? limitRaw : 50));

  const conditions = [eq(schema.events.orgId, orgId)];
  if (eventType) conditions.push(eq(schema.events.eventType, eventType));
  if (entityType) conditions.push(eq(schema.events.entityType, entityType));
  if (actorId) conditions.push(eq(schema.events.actorId, actorId));
  if (from) conditions.push(sql`${schema.events.occurredAt} >= ${new Date(from)}`);
  if (to) conditions.push(sql`${schema.events.occurredAt} <= ${new Date(to)}`);
  if (beforeSeq) conditions.push(lt(schema.events.seq, Number(beforeSeq)));

  const rows = await db
    .select()
    .from(schema.events)
    .where(and(...conditions))
    .orderBy(desc(schema.events.seq))
    .limit(limit);

  return NextResponse.json({
    ok: true,
    data: rows,
    nextBeforeSeq: rows.length === limit ? rows[rows.length - 1].seq : null,
  });
}
