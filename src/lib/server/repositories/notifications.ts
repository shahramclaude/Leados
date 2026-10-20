import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, type NotificationRow } from "@/db/schema";

export type NotificationStatus = NotificationRow["status"];

export interface NotificationFilters {
  status?: NotificationStatus;
  limit?: number;
  offset?: number;
}

export async function listNotifications(filters: NotificationFilters = {}) {
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;
  const where = filters.status ? eq(notifications.status, filters.status) : undefined;

  const [rows, [{ count }], [{ unread }]] = await Promise.all([
    db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(where),
    db
      .select({ unread: sql<number>`count(*)::int` })
      .from(notifications)
      .where(eq(notifications.status, "unread")),
  ]);

  return { rows, total: count, unreadCount: unread };
}

export async function getNotification(id: string): Promise<NotificationRow | undefined> {
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  return row;
}

export async function updateNotificationStatus(
  id: string,
  status: NotificationStatus,
): Promise<NotificationRow | undefined> {
  const [row] = await db
    .update(notifications)
    .set({ status, updatedAt: new Date() })
    .where(eq(notifications.id, id))
    .returning();
  return row;
}

export async function markAllRead(): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ status: "read", updatedAt: new Date() })
    .where(and(eq(notifications.status, "unread")))
    .returning({ id: notifications.id });
  return rows.length;
}

export async function createNotification(input: {
  title: string;
  body?: string;
  domain?: string;
  severity?: number;
  entityType?: string | null;
  entityId?: string | null;
}) {
  const [row] = await db
    .insert(notifications)
    .values({
      title: input.title,
      body: input.body ?? "",
      domain: input.domain ?? "general",
      severity: input.severity ?? 1,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })
    .returning();
  return row;
}
