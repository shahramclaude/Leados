import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { resolveCurrentUser } from "@/lib/currentUser";
import { recordEngagement } from "@/lib/attentionOpt";
import { localHourNow } from "@/lib/circadian";
import { and, eq } from "drizzle-orm";
import type { NotificationClass } from "@/lib/attention";

export const dynamic = "force-dynamic";

// POST /api/notifications/[id]/archive?as=acted|dismissed (default dismissed)
// "acted" records the chain as handled (acted-on); "dismissed" records a
// plain dismissal. Both close the chain; a later event on the same
// dedupeKey reopens it per the state machine (unread -> read -> archived ->
// reopened on material update).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const as = url.searchParams.get("as") === "acted" ? "acted" : "dismissed";

  const [row] = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
    .limit(1);
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  await db
    .update(notifications)
    .set({ state: "archived", archivedAt: new Date() })
    .where(eq(notifications.id, id));

  const [userRow] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  await recordEngagement({
    userId: user.id,
    class: row.class as NotificationClass,
    hourOfDay: localHourNow(userRow?.timezone ?? "UTC"),
    signal: as,
  });

  const [updated] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  return Response.json({ item: updated });
}
