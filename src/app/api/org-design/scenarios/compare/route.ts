import { db } from "@/db";
import { simulationRuns } from "@/db/schema";
import { compareScenarios, NO_SINGLE_SCORE_POLICY, type ScenarioResult } from "@/lib/org-design/scenarioCompare";
import type { DeliveryImpact, HumanImpactSummary, NetworkImpact } from "@/lib/org-design/types";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const simulationRunIds: number[] = Array.isArray(body.simulationRunIds) ? body.simulationRunIds.map(Number) : [];
  if (simulationRunIds.length < 2) {
    return Response.json({ ok: false, error: "At least 2 simulationRunIds are required to compare." }, { status: 400 });
  }

  const runs = await db.select().from(simulationRuns).where(inArray(simulationRuns.id, simulationRunIds));
  const results: ScenarioResult[] = runs.map((r) => ({
    simulationRunId: r.id,
    label: r.label,
    deliveryImpact: r.deliveryImpact as DeliveryImpact,
    networkImpact: r.networkImpact as NetworkImpact,
    humanImpactSummary: r.humanImpactSummary as HumanImpactSummary,
  }));

  const rows = compareScenarios(results);
  return Response.json({ ok: true, rows, policy: NO_SINGLE_SCORE_POLICY });
}
