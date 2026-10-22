import { listInitiatives, listMilestones } from "@/lib/strategy/initiatives";
import { monteCarloDeliveryDays, topInitiativesByWsjf } from "@/lib/strategy/portfolioMath";

export const dynamic = "force-dynamic";

// Monte Carlo delivery-date risk for the top-20 initiatives by WSJF.
// Phase 3d: cached per initiative (see portfolioMath.monteCarloDeliveryDays).
export async function GET() {
  const initiatives = await listInitiatives();
  const top20 = topInitiativesByWsjf(initiatives, 20);
  const milestones = await listMilestones(top20.map((i) => i.id));

  const results = top20.map((init) => ({
    initiative: init,
    monteCarlo: monteCarloDeliveryDays(init.id, milestones),
  }));

  return Response.json({ results });
}
