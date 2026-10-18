import { db } from "@/db";
import { leados_hypotheses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hypothesisId = Number(id);
  const { status } = await req.json();
  if (status !== "confirmed" && status !== "refuted") {
    return Response.json({ error: "status must be confirmed or refuted" }, { status: 400 });
  }
  const [updated] = await db
    .update(leados_hypotheses)
    .set({ status })
    .where(eq(leados_hypotheses.id, hypothesisId))
    .returning();
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  await logAudit("HYPOTHESIS_UPDATED", `#${hypothesisId} -> ${status}`);
  return Response.json(updated);
}
