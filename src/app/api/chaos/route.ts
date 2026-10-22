import { db } from "@/db";
import { chaosExperiments, risks } from "@/db/schema";
import { applyChaosToRisk, type ChaosOutcome } from "@/lib/chaos";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(chaosExperiments);
  return Response.json({ experiments: rows });
}

// Seam 3 proving endpoint: running a chaos experiment against a risk
// updates that risk's belief score in the same transaction-equivalent flow.
export async function POST(request: Request) {
  const body = await request.json();
  const outcome = body?.outcome as ChaosOutcome | undefined;
  if (!body?.name || !body?.targetRiskId || !outcome) {
    return Response.json({ error: "name, targetRiskId, outcome are required" }, { status: 400 });
  }
  if (!["held", "breached", "inconclusive"].includes(outcome)) {
    return Response.json({ error: "outcome must be held | breached | inconclusive" }, { status: 400 });
  }

  const [risk] = await db.select().from(risks).where(eq(risks.id, Number(body.targetRiskId)));
  if (!risk) {
    return Response.json({ error: "targetRiskId not found" }, { status: 404 });
  }

  const beliefBefore = Number(risk.beliefScore);
  const beliefAfter = applyChaosToRisk(beliefBefore, outcome);

  const [experiment] = await db
    .insert(chaosExperiments)
    .values({
      name: body.name,
      targetRiskId: risk.id,
      outcome,
      beliefBefore: String(beliefBefore),
      beliefAfter: String(beliefAfter),
      notes: body.notes ?? null,
    })
    .returning();

  const [updatedRisk] = await db
    .update(risks)
    .set({ beliefScore: String(beliefAfter), updatedAt: new Date() })
    .where(eq(risks.id, risk.id))
    .returning();

  return Response.json({ experiment, risk: updatedRisk }, { status: 201 });
}
