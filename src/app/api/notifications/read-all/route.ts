// LEADOS Part 14 — POST /api/notifications/read-all
// Bulk triage: marks every unread/reopened notification (and its chain
// children) as read for the current user. Returns the affected ids so the
// client can offer a single "Undo" action.
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import { resolveActor } from "@/lib/demoContext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await resolveActor(req);
  const body = await req.json().catch(() => ({} as { ids?: string[] }));

  const targetRows = body.ids?.length
    ? await db.select().from(notifications).where(and(eq(notifications.userId, actor.userId), inArray(notifications.id, body.ids)))
    : await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, actor.userId), or(eq(notifications.state, "unread"), eq(notifications.state, "reopened"))));

  const ids = targetRows.map((r) => r.id);
  if (ids.length === 0) return Response.json({ updated: [], previousStates: {} });

  const previousStates: Record<string, string> = Object.fromEntries(targetRows.map((r) => [r.id, r.state]));

  await db
    .update(notifications)
    .set({ state: "read", updatedAt: new Date(), readAt: new Date() })
    .where(and(eq(notifications.userId, actor.userId), inArray(notifications.id, ids)));

  return Response.json({ updated: ids, previousStates });
}
