// Advances a deal's phase and fires the obligation cascade (Part 53 lineage):
// change-of-control obligations trigger as soon as the deal reaches
// "announce"; phase-scoped obligations fire when their phase is reached.

import { db } from "@/db";
import { maDeals, obligationCascadeEvents, obligations } from "@/db/schema";
import { dueDateForObligation, obligationsToFire, type DealPhase } from "@/lib/org-design/obligationCascade";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const VALID_PHASES: DealPhase[] = ["diligence", "announce", "integrate", "complete"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dealId = Number(id);
  const body = await req.json();
  const nextPhase = body.phase as DealPhase;

  if (!Number.isFinite(dealId) || !VALID_PHASES.includes(nextPhase)) {
    return Response.json({ ok: false, error: "A valid `phase` is required." }, { status: 400 });
  }

  const [deal] = await db.select().from(maDeals).where(eq(maDeals.id, dealId));
  if (!deal) return Response.json({ ok: false, error: "Deal not found" }, { status: 404 });

  const [updatedDeal] = await db.update(maDeals).set({ phase: nextPhase }).where(eq(maDeals.id, dealId)).returning();

  const dealObligations = await db.select().from(obligations).where(eq(obligations.dealId, dealId));
  const toFire = obligationsToFire(
    dealObligations.map((o) => ({ id: o.id, type: o.type, triggerCondition: o.triggerCondition, status: o.status })),
    nextPhase,
  );

  const closeDate = deal.closeDate ? new Date(deal.closeDate) : new Date();
  const firedEvents = [];
  for (const o of toFire) {
    const dueDate = dueDateForObligation(o.type, closeDate);
    const [event] = await db
      .insert(obligationCascadeEvents)
      .values({ dealId, obligationId: o.id, triggerType: o.triggerCondition, dueDate, status: "triggered" })
      .returning();
    await db.update(obligations).set({ status: "triggered" }).where(eq(obligations.id, o.id));
    firedEvents.push(event);
  }

  return Response.json({ ok: true, deal: updatedDeal, firedEvents, firedCount: firedEvents.length });
}
