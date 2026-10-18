import { db } from "@/db";
import { leados_decisions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionId = Number(id);
  const body = await req.json().catch(() => ({}));
  const status = body.status === "resolved" ? "resolved" : "resolved";
  const [updated] = await db
    .update(leados_decisions)
    .set({ status, resolvedAt: new Date() })
    .where(eq(leados_decisions.id, decisionId))
    .returning();
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  await logAudit("DECISION_RESOLVED", updated.title);
  return Response.json(updated);
}
