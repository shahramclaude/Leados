import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leados_notifications } from "@/db/schema";
import { publishStreamEvent } from "@/lib/eventBus";

export const dynamic = "force-dynamic";

/** GET /api/notifications?page=1&pageSize=20&all=false — paginated unread notifications. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20") || 20));
  const includeAll = searchParams.get("all") === "true";

  const whereClause = includeAll ? undefined : eq(leados_notifications.read, false);

  const [rows, [{ unread }], [{ total }]] = await Promise.all([
    db
      .select()
      .from(leados_notifications)
      .where(whereClause)
      .orderBy(desc(leados_notifications.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ unread: sql<number>`count(*)::int` })
      .from(leados_notifications)
      .where(eq(leados_notifications.read, false)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(leados_notifications)
      .where(whereClause),
  ]);

  return NextResponse.json({
    notifications: rows,
    page,
    pageSize,
    total,
    unreadCount: unread,
  });
}

/** DELETE /api/notifications — mark every notification as read ("mark all read"). */
export async function DELETE() {
  const updated = await db
    .update(leados_notifications)
    .set({ read: true })
    .where(eq(leados_notifications.read, false))
    .returning({ id: leados_notifications.id });

  publishStreamEvent({
    type: "notification",
    action: "all_read",
    payload: { ids: updated.map((r) => r.id) },
  });

  return NextResponse.json({ ok: true, updated: updated.length });
}

/** PATCH /api/notifications — mark a single notification read by body { id }. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "A numeric 'id' is required" }, { status: 400 });
  }

  const [row] = await db
    .update(leados_notifications)
    .set({ read: true })
    .where(eq(leados_notifications.id, id))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  publishStreamEvent({ type: "notification", action: "read", payload: row });

  return NextResponse.json({ notification: row });
}
