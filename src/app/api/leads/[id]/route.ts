import { db } from "@/db";
import { leads } from "@/db/schema";
import { getOrCreateDemoTenant } from "@/lib/tenant";
import { appendDecision } from "@/lib/ledger";
import { and, eq } from "drizzle-orm";
import { isStage } from "@/lib/forecast";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tenant = await getOrCreateDemoTenant();
  const body = await request.json().catch(() => null);

  if (!body || typeof body.stage !== "string" || !isStage(body.stage)) {
    return Response.json(
      { error: "stage must be one of: new, contacted, qualified, proposal, negotiation, won, lost" },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenant.id)))
    .limit(1);

  if (!existing) {
    return Response.json({ error: "Lead not found" }, { status: 404 });
  }

  const previousStage = existing.stage;

  const [updated] = await db
    .update(leads)
    .set({ stage: body.stage, updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenant.id)))
    .returning();

  await appendDecision({
    tenantId: tenant.id,
    entityType: "lead",
    entityId: updated.id,
    action: "lead.stage_changed",
    payload: { from: previousStage, to: updated.stage },
    rationale: `Lead "${updated.name}" moved from stage "${previousStage}" to "${updated.stage}".`,
  });

  return Response.json({ lead: updated });
}
