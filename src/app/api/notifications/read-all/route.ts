import { db } from "@/db";
import { notifications } from "@/db/schema";
import { resolveCurrentUser } from "@/lib/currentUser";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const domain = typeof body?.domain === "string" ? body.domain : null;

  const conditions = [eq(notifications.userId, user.id), eq(notifications.state, "unread")] as const;
  const rows = await db
    .select()
    .from(notifications)
    .where(domain ? and(...conditions, eq(notifications.domain, domain)) : and(...conditions));

  if (rows.length === 0) return Response.json({ updated: 0 });

  const now = new Date();
  for (const row of rows) {
    await db.update(notifications).set({ state: "read", readAt: now }).where(eq(notifications.id, row.id));
  }

  return Response.json({ updated: rows.length });
}
