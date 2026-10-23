import { db } from "@/db";
import {
  integrationDifficultyScores,
  maDeals,
  obligationCascadeEvents,
  obligations,
  readinessChecklistItems,
  synergyEstimates,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dealId = Number(id);
  if (!Number.isFinite(dealId)) return Response.json({ ok: false, error: "Invalid deal id" }, { status: 400 });

  const [deal] = await db.select().from(maDeals).where(eq(maDeals.id, dealId));
  if (!deal) return Response.json({ ok: false, error: "Deal not found" }, { status: 404 });

  const [dealObligations, synergy, cascadeEvents, checklist, integrationScores] = await Promise.all([
    db.select().from(obligations).where(eq(obligations.dealId, dealId)),
    db.select().from(synergyEstimates).where(eq(synergyEstimates.dealId, dealId)),
    db.select().from(obligationCascadeEvents).where(eq(obligationCascadeEvents.dealId, dealId)).orderBy(desc(obligationCascadeEvents.firedAt)),
    db.select().from(readinessChecklistItems).where(eq(readinessChecklistItems.dealId, dealId)),
    db.select().from(integrationDifficultyScores).where(eq(integrationDifficultyScores.dealId, dealId)).orderBy(desc(integrationDifficultyScores.createdAt)),
  ]);

  return Response.json({ ok: true, deal, obligations: dealObligations, synergy, cascadeEvents, checklist, integrationScores });
}
