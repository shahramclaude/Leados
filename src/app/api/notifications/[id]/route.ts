// GET   /api/notifications/:id — fetch a single notification
// PATCH /api/notifications/:id — update state (read/unread/archived) and/or
//                                 record feedback (opened/dismissed/acted/snoozed)
//                                 which feeds the adaptive batching optimizer.

import { db } from "@/db";
import { notificationFeedback, notifications } from "@/db/schema";
import { getCurrentUserId } from "@/lib/auth";
import { publishEvent } from "@/lib/eventBus";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set(["unread", "read", "archived"]);
const VALID_FEEDBACK = new Set(["opened", "dismissed", "acted", "snoozed"]);

async function loadOwned(userId: string, id: string) {
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const userId = await getCurrentUserId(request);
  const row = await loadOwned(userId, id);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ notification: row });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const userId = await getCurrentUserId(request);
  const existing = await loadOwned(userId, id);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const { status, feedback } = body as { status?: string; feedback?: string };

  if (status !== undefined && !VALID_STATUS.has(status)) {
    return Response.json({ error: `status must be one of ${[...VALID_STATUS].join(", ")}` }, { status: 400 });
  }
  if (feedback !== undefined && !VALID_FEEDBACK.has(feedback)) {
    return Response.json({ error: `feedback must be one of ${[...VALID_FEEDBACK].join(", ")}` }, { status: 400 });
  }

  const [updated] = await db
    .update(notifications)
    .set({
      status: status ?? existing.status,
      updatedAt: new Date(),
    })
    .where(eq(notifications.id, id))
    .returning();

  if (feedback) {
    await db.insert(notificationFeedback).values({ notificationId: id, userId, action: feedback });
  }

  await publishEvent({
    userId,
    type: "notification.updated",
    domain: updated.domain,
    severity: updated.severity,
    entityType: updated.entityType ?? undefined,
    entityId: updated.entityId ?? undefined,
    dedupKey: updated.dedupKey,
    payload: { notificationId: updated.id, status: updated.status, feedback: feedback ?? null },
  });

  return Response.json({ notification: updated });
}
