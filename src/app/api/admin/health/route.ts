import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getProjectionLagMs } from "@/lib/platform/events/projector";

export const dynamic = "force-dynamic";

/** Platform health metrics: projection lag, outbox backlog, event/org counts. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("orgId") ?? undefined;

  const projectionLagMs = await getProjectionLagMs(db, orgId);

  const pendingRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.outbox)
    .where(orgId ? sql`${schema.outbox.orgId} = ${orgId} and ${schema.outbox.status} = 'pending'` : eq(schema.outbox.status, "pending"));

  const eventCountRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.events)
    .where(orgId ? eq(schema.events.orgId, orgId) : sql`true`);

  const orgCountRows = await db.select({ count: sql<number>`count(*)::int` }).from(schema.orgs);

  return NextResponse.json({
    ok: true,
    data: {
      projectionLagMs,
      outboxPending: pendingRows[0]?.count ?? 0,
      totalEvents: eventCountRows[0]?.count ?? 0,
      totalOrgs: orgCountRows[0]?.count ?? 0,
      checkedAt: new Date().toISOString(),
    },
  });
}
