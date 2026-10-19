import { listEvents } from "@/lib/eventStore";
import { project, latestFinance } from "@/lib/eventBrain";
import { runMonteCarloRunway, computeUnitEconomics, computeFundraisingReadiness, computeCapitalEfficiency } from "@/lib/financialOS";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await listEvents();
    const projection = project(events);
    const snapshot = latestFinance(projection);
    if (!snapshot) {
      return Response.json({ snapshot: null, message: "No finance.snapshot events recorded yet." });
    }
    const arrGrowthSeries = projection.metrics["arr_growth_rate"];
    const arrGrowthRate = arrGrowthSeries?.length ? arrGrowthSeries[arrGrowthSeries.length - 1].value : 0.05;
    const runway = runMonteCarloRunway(snapshot.cash, snapshot.monthlyBurn, arrGrowthRate);
    const unitEconomics = computeUnitEconomics(snapshot);
    const capitalEfficiency = computeCapitalEfficiency(snapshot, unitEconomics);
    const fundraising = computeFundraisingReadiness(runway, unitEconomics, arrGrowthRate, 14);
    return Response.json({ snapshot, runway, unitEconomics, capitalEfficiency, fundraising, arrGrowthRate });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
