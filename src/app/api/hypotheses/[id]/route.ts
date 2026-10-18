import { db } from "@/db";
import { leados_hypotheses } from "@/db/schema";
import { logAudit } from "@/lib/leados/audit";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isFinite(idNum)) return Response.json({ error: "invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string") patch.status = body.status;
  if (typeof body.confidence === "number") patch.confidence = body.confidence;

  const [row] = await db.update(leados_hypotheses).set(patch).where(eq(leados_hypotheses.id, idNum)).returning();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  await logAudit("HYPOTHESIS_UPDATED", `${row.statement} → ${row.status}`);
  return Response.json(row);
}
