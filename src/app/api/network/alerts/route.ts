import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dependencyAlerts } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const rows = status
    ? await db
        .select()
        .from(dependencyAlerts)
        .where(eq(dependencyAlerts.status, status))
        .orderBy(desc(dependencyAlerts.createdAt))
    : await db.select().from(dependencyAlerts).orderBy(desc(dependencyAlerts.createdAt));

  return Response.json({ alerts: rows });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { id?: string; status?: "acknowledged" | "resolved" }
    | null;

  if (!body?.id || !body?.status) {
    return Response.json({ error: "id and status are required" }, { status: 400 });
  }

  const [updated] = await db
    .update(dependencyAlerts)
    .set({
      status: body.status,
      resolvedAt: body.status === "resolved" ? new Date() : null,
    })
    .where(eq(dependencyAlerts.id, body.id))
    .returning();

  if (!updated) {
    return Response.json({ error: "alert not found" }, { status: 404 });
  }

  return Response.json({ alert: updated });
}
