import { db } from "@/db";
import { decisions } from "@/db/schema";
import { DEFAULT_ORG_ID } from "@/lib/org";
import { analyzeDecision, type Alternative } from "@/lib/decision";
import { appendAuditEvent } from "@/lib/audit";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [existing] = await db
    .select()
    .from(decisions)
    .where(and(eq(decisions.id, id), eq(decisions.orgId, DEFAULT_ORG_ID)));

  if (!existing) {
    return Response.json({ code: "not_found", detail: "Decision not found" }, { status: 404 });
  }

  const alternatives = (existing.alternatives as Alternative[]) ?? [];
  const analysis = analyzeDecision(alternatives);

  const [updated] = await db
    .update(decisions)
    .set({
      status: "analyzed",
      analysis,
      recommendation: analysis.recommendation,
      evpi: analysis.evpi,
      updatedAt: new Date(),
    })
    .where(eq(decisions.id, id))
    .returning();

  await appendAuditEvent({
    orgId: DEFAULT_ORG_ID,
    action: "decision.analyzed",
    entityType: "decision",
    entityId: id,
    metadata: { evpi: analysis.evpi, bestAlternativeId: analysis.bestAlternativeId },
  });

  return Response.json({ item: updated });
}
