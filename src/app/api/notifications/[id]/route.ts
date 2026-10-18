import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leados_notifications } from "@/db/schema";
import { publishStreamEvent } from "@/lib/eventBus";

export const dynamic = "force-dynamic";

/** PATCH /api/notifications/:id — mark a single notification as read. */
export async function PATCH(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid notification id" }, { status: 400 });
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
