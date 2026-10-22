import { eq } from "drizzle-orm";
import { db } from "@/db";
import { decisions, leads, reps, rotationState } from "@/db/schema";
import { getTenantBySlug, resolveTenantSlug } from "@/lib/tenant";
import { nextRepInRotation } from "@/lib/rotation";

export const dynamic = "force-dynamic";

interface AssignBody {
  leadId?: number;
}

export async function POST(request: Request) {
  const slug = await resolveTenantSlug(request);
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: `unknown tenant '${slug}'` }, { status: 404 });

  const body = (await request.json().catch(() => null)) as AssignBody | null;
  if (!body?.leadId) {
    return Response.json({ error: "leadId is required" }, { status: 400 });
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, body.leadId)).limit(1);
  if (!lead || lead.tenantId !== tenant.id) {
    return Response.json({ error: "lead not found for tenant" }, { status: 404 });
  }

  const tenantReps = await db.select().from(reps).where(eq(reps.tenantId, tenant.id));
  const [state] = await db
    .select()
    .from(rotationState)
    .where(eq(rotationState.tenantId, tenant.id))
    .limit(1);

  const next = nextRepInRotation(tenantReps, state?.lastRepId ?? null);
  if (!next) {
    return Response.json({ error: "no active reps to assign" }, { status: 409 });
  }

  const nextRep = tenantReps.find((rep) => rep.id === next.id)!;

  await db.update(leads).set({ repId: nextRep.id }).where(eq(leads.id, lead.id));

  if (state) {
    await db
      .update(rotationState)
      .set({ lastRepId: nextRep.id, updatedAt: new Date() })
      .where(eq(rotationState.id, state.id));
  } else {
    await db.insert(rotationState).values({ tenantId: tenant.id, lastRepId: nextRep.id });
  }

  await db.insert(decisions).values({
    tenantId: tenant.id,
    leadId: lead.id,
    type: "rotated",
    actor: "system",
    summary: `Assigned "${lead.name}" (${lead.company}) to ${nextRep.name} via round-robin rotation.`,
    evidence: { candidateRepIds: tenantReps.filter((r) => r.active).map((r) => r.id), chosenRepId: nextRep.id },
  });

  return Response.json({ lead: { ...lead, repId: nextRep.id }, rep: nextRep });
}
