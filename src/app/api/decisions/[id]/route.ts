import { db } from "@/db";
import { leados_decisions } from "@/db/schema";
import { logAudit } from "@/lib/leados/audit";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isFinite(idNum)) return Response.json({ error: "invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.status) {
    patch.status = body.status;
    if (body.status === "resolved") patch.resolvedAt = new Date();
  }
  if (body.title) patch.title = body.title;
  if (body.owner) patch.owner = body.owner;

  const [row] = await db.update(leados_decisions).set(patch).where(eq(leados_decisions.id, idNum)).returning();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  await logAudit("DECISION_UPDATED", `${row.title} → ${row.status}`);
  return Response.json(row);
}
