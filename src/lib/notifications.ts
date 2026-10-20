// src/lib/notifications.ts — paginated, indexed notification feed
// (notifications_read_created_at_idx backs the "unread first" query).
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { decodeCursor, encodeCursor, parseLimit, type Page } from "./pagination";

export interface NotificationRecord {
  id: number;
  title: string;
  body: string;
  severity: string;
  read: boolean;
  createdAt: string;
}

function toRecord(row: typeof notifications.$inferSelect): NotificationRecord {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function listNotifications(searchParams: URLSearchParams): Promise<Page<NotificationRecord>> {
  const limit = parseLimit(searchParams);
  const unreadOnly = searchParams.get("unread") === "true";
  const cursor = decodeCursor(searchParams.get("cursor"));

  const conditions = [];
  if (unreadOnly) conditions.push(eq(notifications.read, false));
  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);
    conditions.push(
      or(
        lt(notifications.createdAt, cursorDate),
        and(eq(notifications.createdAt, cursorDate), lt(notifications.id, cursor.id)),
      ),
    );
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
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

export async function countUnread(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(eq(notifications.read, false));
  return row?.count ?? 0;
}
