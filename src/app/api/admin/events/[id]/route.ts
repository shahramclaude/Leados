import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { computeEventHash } from "@/lib/platform/events/envelope";

export const dynamic = "force-dynamic";

/** Single-event payload inspector, plus a hash-chain integrity check against its immediate predecessor. */
export async function GET(_request: Request, routeContext: { params: Promise<{ id: string }> }) {
  const { id } = await routeContext.params;
  const rows = await db.select().from(schema.events).where(eq(schema.events.id, id)).limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: { code: "not_found", message: "event not found" } }, { status: 404 });
  }
  const row = rows[0];

  const recomputedHash = computeEventHash(row.prevHash, {
    eventId: row.id,
    eventType: row.eventType,
    schemaVersion: row.schemaVersion,
    orgId: row.orgId,
    entityType: row.entityType,
    entityId: row.entityId,
    occurredAt: new Date(row.occurredAt).toISOString(),
    recordedAt: new Date(row.recordedAt).toISOString(),
    correlationId: row.correlationId,
    causationId: row.causationId,
    idempotencyKey: row.idempotencyKey,
    payload: row.payload,
    seq: row.seq,
  });

  let predecessorOk: boolean | null = null;
  if (row.prevHash) {
    const prevRows = await db
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.orgId, row.orgId), eq(schema.events.hash, row.prevHash)))
      .limit(1);
    predecessorOk = prevRows.length > 0;
  } else {
    predecessorOk = row.seq === 1 || row.seq === (await firstSeqForOrg(row.orgId));
  }

  return NextResponse.json({
    ok: true,
    data: {
      event: row,
      hashVerification: {
        storedHash: row.hash,
        recomputedHash,
        matches: recomputedHash === row.hash,
        predecessorFound: predecessorOk,
      },
    },
  });
}

async function firstSeqForOrg(orgId: string): Promise<number> {
  const rows = await db.select({ seq: schema.events.seq }).from(schema.events).where(eq(schema.events.orgId, orgId)).limit(1);
  return rows[0]?.seq ?? 1;
}
