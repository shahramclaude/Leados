import { db } from "@/db";
import { financeAssumptions, financialEvents, people, hiringPlanItems } from "@/db/schema";
import { asc, desc } from "drizzle-orm";
import { jsonError } from "@/lib/api";
import { buildMonthlyPnL, computeBurnTrend, runMonteCarloRunway, computeFundraisingReadiness, computeCovenantStatus, type FinancialEventRecord } from "@/lib/financialOS";
import { computeHeadcountCost, type PersonRecord } from "@/lib/financeEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [assumptionsRow] = await db.select().from(financeAssumptions).orderBy(desc(financeAssumptions.id)).limit(1);
    const eventRows = await db.select().from(financialEvents).orderBy(asc(financialEvents.date));
    const peopleRows = await db.select().from(people);
    const hiringRows = await db.select().from(hiringPlanItems);

    const assumptions = assumptionsRow ?? {
      currentCashBalance: 1000000,
      baselineMonthlyRevenue: 50000,
      baselineRevenueGrowthRate: 0.03,
      grossMarginPct: 0.72,
      covenantMinCashMonths: 3,
      covenantMinCashBalance: 250000,
    };

    const events: FinancialEventRecord[] = eventRows.map((e) => ({
      date: e.date,
      type: e.type as FinancialEventRecord["type"],
      domain: e.domain,
      team: e.team,
      amount: e.amount,
      category: e.category,
      description: e.description,
    }));

    const pnl = buildMonthlyPnL(events);
    const burnTrend = computeBurnTrend(pnl);
    const lastPnl = pnl[pnl.length - 1];
    const trailingRevenue = lastPnl?.revenue ?? assumptions.baselineMonthlyRevenue;

    const personRecords: PersonRecord[] = peopleRows.map((p) => ({ name: p.name, role: p.role, domain: p.domain, team: p.team, monthlySalary: p.monthlySalary, active: p.active }));
    const headcountCost = computeHeadcountCost(personRecords);

    const hiringPlan = hiringRows.map((h) => ({
      role: h.role,
      domain: h.domain,
      team: h.team,
      startMonth: h.startMonth,
      monthlyCostEstimate: h.monthlyCostEstimate,
      headcountDelta: h.headcountDelta,
      scenarioTag: h.scenarioTag,
    }));

    const runway = runMonteCarloRunway({
      currentCash: assumptions.currentCashBalance,
      baselineMonthlyBurn: burnTrend.trailingAvgMonthlyBurn || headcountCost.totalMonthlyCost,
      baselineMonthlyRevenue: trailingRevenue,
      revenueGrowthRate: assumptions.baselineRevenueGrowthRate,
      hiringPlan,
    });

    const fundraising = computeFundraisingReadiness(runway, assumptions.baselineRevenueGrowthRate, burnTrend);
    const covenant = computeCovenantStatus(assumptions, runway);

    return Response.json({ assumptions, pnl, burnTrend, headcountCost, hiringPlan, runway, fundraising, covenant });
  } catch (err) {
    return jsonError((err as Error).message, 500);
  }
}
