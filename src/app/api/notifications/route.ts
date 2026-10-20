// GET  /api/notifications          — list current user's notifications (paginated)
// POST /api/notifications          — create a notification (internal/dev/test use;
//                                     production call sites are domain events, see
//                                     src/lib/notifications.ts)

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getCurrentUserId } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { and, desc, eq, lt } from "drizzle-orm";
import type { RealtimeEventType } from "@/lib/eventBus";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  const userId = await getCurrentUserId(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status"); // unread | read | archived | null (all)
  const cursor = url.searchParams.get("cursor");

  const conditions = [eq(notifications.userId, userId)];
  if (status) conditions.push(eq(notifications.status, status));
  if (cursor) conditions.push(lt(notifications.createdAt, new Date(cursor)));

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  const counts = await db
    .select({ status: notifications.status })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.status, "unread")));

  return Response.json({
    notifications: page,
    unreadCount: counts.length,
    nextCursor: hasMore ? page[page.length - 1]?.createdAt.toISOString() : null,
  });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId(request);
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, domain, severity, title, bodyText, entityType, entityId, dedupKey } = body as Record<string, unknown>;

  if (
    typeof type !== "string" ||
    typeof domain !== "string" ||
    typeof severity !== "number" ||
    typeof title !== "string" ||
    typeof bodyText !== "string" ||
    typeof dedupKey !== "string"
  ) {
    return Response.json(
      { error: "Required fields: type, domain, severity, title, bodyText, dedupKey" },
      { status: 400 },
    );
  }

  const result = await createNotification({
    userId,
    type: type as RealtimeEventType,
    domain,
    severity,
    title,
    body: bodyText,
    entityType: typeof entityType === "string" ? entityType : undefined,
    entityId: typeof entityId === "string" ? entityId : undefined,
    dedupKey,
  });

  return Response.json(result, { status: 201 });
}
