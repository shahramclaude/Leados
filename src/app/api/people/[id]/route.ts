import { db } from "@/db";
import { leados_people } from "@/db/schema";
import { logAudit } from "@/lib/leados/audit";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isFinite(idNum)) return Response.json({ error: "invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.role === "string") patch.role = body.role;
  if (typeof body.cadenceDays === "number") patch.cadenceDays = body.cadenceDays;
  if (typeof body.archived === "boolean") patch.archived = body.archived;

  const [row] = await db.update(leados_people).set(patch).where(eq(leados_people.id, idNum)).returning();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  await logAudit("PERSON_UPDATED", `${row.name} updated`);
  return Response.json(row);
}
