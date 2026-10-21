import { db } from "@/db";
import { notifications } from "@/db/schema";
import { resolveCurrentUser } from "@/lib/currentUser";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;

  const [row] = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
    .limit(1);

  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  const children = await db.select().from(notifications).where(eq(notifications.parentId, id));

  return Response.json({ item: row, children });
}
