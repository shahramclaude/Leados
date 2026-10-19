// src/lib/repositories/eventsRepository.ts
//
// Typed, read-only repository over the event log. This is the only place
// outside src/lib/events/eventStore.ts allowed to `db.select().from(events)`.
// Supports keyset (cursor) pagination — never OFFSET, which degrades on a
// large append-only log — and an `asOf` bound for retrospective queries.

import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { rowToEvent, type LeadosEvent } from "@/lib/events/eventStore";

export interface ListEventsParams {
  /** Opaque cursor from the previous page's `nextCursor`. */
  cursor?: string | null;
  limit?: number;
  domain?: string;
  type?: string;
  entityId?: string;
  correlationId?: string;
  /** Only events recorded at-or-before this instant (transaction time) — powers "what had we logged as of X". */
  asOf?: Date;
}

export interface ListEventsResult {
  items: LeadosEvent[];
  nextCursor: string | null;
}

function decodeCursor(cursor: string | null | undefined): bigint | null {
  if (!cursor) return null;
  try {
    return BigInt(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function encodeCursor(seq: bigint): string {
  return Buffer.from(seq.toString(), "utf8").toString("base64url");
}

export async function listEvents(params: ListEventsParams = {}): Promise<ListEventsResult> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
  const afterSeq = decodeCursor(params.cursor);

  const conditions = [
    afterSeq !== null ? gt(events.seq, afterSeq) : undefined,
    params.domain ? eq(events.domain, params.domain) : undefined,
    params.type ? eq(events.type, params.type) : undefined,
    params.entityId ? eq(events.entityId, params.entityId) : undefined,
    params.correlationId ? eq(events.correlationId, params.correlationId) : undefined,
    params.asOf ? lte(events.recordedAt, params.asOf) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select()
    .from(events)
    .where(conditions.length ? and(...(conditions as Parameters<typeof and>)) : undefined)
    .orderBy(asc(events.seq))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? encodeCursor(page[page.length - 1].seq) : null;

  return { items: page.map(rowToEvent), nextCursor };
}

export async function getEventById(id: string): Promise<LeadosEvent | null> {
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return row ? rowToEvent(row) : null;
}

/** Full causal chain: every event sharing a correlationId, oldest first. */
export async function getCorrelationChain(correlationId: string): Promise<LeadosEvent[]> {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.correlationId, correlationId))
    .orderBy(asc(events.seq));
  return rows.map(rowToEvent);
}

export async function countEvents(): Promise<number> {
  const result = await db.execute<{ count: string }>(sql`select count(*)::text as count from events`);
  return Number((result.rows[0] as { count: string } | undefined)?.count ?? 0);
}

export async function latestEventTimestamp(): Promise<string | null> {
  const [row] = await db.select().from(events).orderBy(desc(events.seq)).limit(1);
  return row ? new Date(row.recordedAt).toISOString() : null;
}
