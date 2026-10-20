import { db } from "@/db";
import { events } from "@/db/schema";
import { and, count, desc, lt } from "drizzle-orm";
import type { EventRecord, Page } from "@/lib/domain/types";
import { decodeCursor, encodeCursor, parseLimit } from "../pagination";

function toRecord(row: typeof events.$inferSelect): EventRecord {
  return {
    id: row.id,
    type: row.type,
    version: row.version,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function insertEvent(input: {
  type: string;
  version: number;
  payload: unknown;
}): Promise<EventRecord> {
  const [row] = await db
    .insert(events)
    .values({ type: input.type, version: input.version, payload: input.payload })
    .returning();
  return toRecord(row);
}

export async function listEventsPage(searchParams: URLSearchParams): Promise<Page<EventRecord>> {
  const limit = parseLimit(searchParams);
  const cursor = decodeCursor(searchParams.get("cursor"));

  const where = cursor ? lt(events.id, cursor.id) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(events)
      .where(where ? and(where) : undefined)
      .orderBy(desc(events.id))
      .limit(limit + 1),
    db.select({ value: count() }).from(events),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map(toRecord);
  const nextCursor = hasMore ? encodeCursor({ id: items[items.length - 1].id }) : null;

  return { items, nextCursor, total: totalRow[0]?.value ?? 0 };
}

export async function countEvents(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(events);
  return row?.value ?? 0;
}

/** Test/dev helper: removes all rows. Never exposed over HTTP. */
export async function truncateEvents(): Promise<void> {
  await db.delete(events);
}
