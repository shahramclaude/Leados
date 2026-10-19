import { runMonteCarloRunway, computeFundraisingReadiness, computeUnitEconomics } from "@/lib/financialOS";
import type { FinanceSnapshotState } from "@/lib/eventBrain";

export const dynamic = "force-dynamic";

// What-if simulator: 4 number inputs -> immediate recalculation.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cash = Number(body.cash ?? 1000000);
    const monthlyBurn = Number(body.monthlyBurn ?? 150000);
    const arrGrowthRate = Number(body.arrGrowthRate ?? 0.05);
    const newCustomers = Number(body.newCustomers ?? 5);

    const snapshot: FinanceSnapshotState = {
      ts: new Date().toISOString(),
      cash,
      monthlyBurn,
      mrr: Number(body.mrr ?? 80000),
      newArr: Number(body.newArr ?? 150000),
      churnedArr: Number(body.churnedArr ?? 30000),
      customers: Number(body.customers ?? 40),
      newCustomers,
      cac: Number(body.cac ?? 8000),
      grossMarginPct: Number(body.grossMarginPct ?? 0.7),
      headcount: Number(body.headcount ?? 20),
      rdHeadcountCost: Number(body.rdHeadcountCost ?? 900000),
      totalPayroll: Number(body.totalPayroll ?? 1700000),
      salesSpend: Number(body.salesSpend ?? newCustomers * Number(body.cac ?? 8000)),
    };

    const runway = runMonteCarloRunway(cash, monthlyBurn, arrGrowthRate, 4242);
    const unitEconomics = computeUnitEconomics(snapshot);
    const fundraising = computeFundraisingReadiness(runway, unitEconomics, arrGrowthRate, 12);

    return Response.json({ runway, unitEconomics, fundraising });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
