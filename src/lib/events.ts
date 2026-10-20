// src/lib/events.ts
//
// Data-access layer for the `events` table — the table this part's "10x
// data day" rehearsal is about. Every list query here is keyset-paginated
// and bounded; there is no "SELECT * FROM events" anywhere in this app.
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { decodeCursor, encodeCursor, parseLimit, type Page } from "./pagination";
import { invalidateForecastCache } from "./forecastCache";
import { invalidatePrefix } from "./queryCache";

export interface EventRecord {
  id: number;
  type: string;
  version: number;
  payload: unknown;
  createdAt: string;
}

function toRecord(row: typeof events.$inferSelect): EventRecord {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function listEvents(searchParams: URLSearchParams): Promise<Page<EventRecord>> {
  const limit = parseLimit(searchParams);
  const type = searchParams.get("type");
  const cursor = decodeCursor(searchParams.get("cursor"));

  const conditions = [];
  if (type) conditions.push(eq(events.type, type));
  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);
    conditions.push(
      or(lt(events.createdAt, cursorDate), and(eq(events.createdAt, cursorDate), lt(events.id, cursor.id))),
    );
  }

  const rows = await db
    .select()
    .from(events)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(events.createdAt), desc(events.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];

  return {
    items: page.map(toRecord),
    hasMore,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
  };
}

export async function countEvents(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(events);
  return row?.count ?? 0;
}

export async function eventTypeBreakdown(): Promise<{ type: string; count: number }[]> {
  const rows = await db
    .select({ type: events.type, count: sql<number>`count(*)::int` })
    .from(events)
    .groupBy(events.type)
    .orderBy(desc(sql`count(*)`))
    .limit(20);
  return rows;
}

export interface RecordEventInput {
  type: string;
  version?: number;
  payload: unknown;
}

export async function recordEvent(input: RecordEventInput): Promise<EventRecord> {
  const [row] = await db
    .insert(events)
    .values({ type: input.type, version: input.version ?? 1, payload: input.payload ?? {} })
    .returning();
  // Explicit, targeted cache invalidation — see forecastCache.ts and
  // queryCache.ts header comments for why this beats a blanket TTL alone.
  invalidateForecastCache();
  invalidatePrefix("stats:");
  return toRecord(row);
}

/** Bulk insert used by the seed script — batches of up to 1,000 rows per round trip. */
export async function bulkInsertEvents(rows: RecordEventInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({ type: r.type, version: r.version ?? 1, payload: r.payload ?? {} }));
    await db.insert(events).values(batch);
    inserted += batch.length;
  }
  invalidateForecastCache();
  invalidatePrefix("stats:");
  return inserted;
}
