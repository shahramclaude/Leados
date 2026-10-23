import { db } from "@/db";
import { leads } from "@/db/schema";
import { appendDecision } from "@/lib/ledger";
import { getOrCreateDefaultTenant } from "@/lib/tenant";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tenant = await getOrCreateDefaultTenant();
  if (!tenant) return Response.json({ error: "tenant unavailable" }, { status: 500 });

  const body = (await request.json()) as { stage?: string };
  if (!body.stage) {
    return Response.json({ error: "stage is required" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenant.id)))
    .limit(1);

  if (!existing) {
    return Response.json({ error: "lead not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(leads)
    .set({ stage: body.stage, updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenant.id)))
    .returning();

  await appendDecision({
    tenantId: tenant.id,
    subjectType: "lead",
    subjectId: id,
    title: `Stage change for "${existing.name}": ${existing.stage} → ${body.stage}`,
    rationale: `Manual stage transition recorded by operator action.`,
    outcome: body.stage,
    confidence: 100,
    confidenceLabel: "measured",
    evidence: [{ previousStage: existing.stage, newStage: body.stage }],
    actor: "operator",
  });

  return Response.json({ lead: updated });
}
