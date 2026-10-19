import { jsonError, parseNumber, readJsonBody } from "@/lib/api";
import { runMonteCarloRunway, computeFundraisingReadiness, computeCovenantStatus, computeBurnTrend } from "@/lib/financialOS";

export const dynamic = "force-dynamic";

// What-if simulator: returns a full distribution (p10/p50/p90 + histogram),
// never a single number. Deterministic given the same body (including
// `seed`) — this is what the reproducibility test suite exercises.
export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req);
    const currentCash = parseNumber(body.currentCash, 1500000);
    const baselineMonthlyBurn = parseNumber(body.monthlyBurn, 180000);
    const baselineMonthlyRevenue = parseNumber(body.monthlyRevenue, 90000);
    const revenueGrowthRate = parseNumber(body.revenueGrowthRate, 0.04);
    const burnVolatility = parseNumber(body.burnVolatility, 0.18);
    const horizonMonths = parseNumber(body.horizonMonths, 24);
    const seed = parseNumber(body.seed, 1337);
    const n = parseNumber(body.n, 2000);

    const runway = runMonteCarloRunway({ currentCash, baselineMonthlyBurn, baselineMonthlyRevenue, revenueGrowthRate, burnVolatility, horizonMonths, seed, n });
    const syntheticBurnTrend = computeBurnTrend([
      { month: "prior", revenue: baselineMonthlyRevenue, expensesByCategory: {}, totalExpenses: baselineMonthlyBurn + baselineMonthlyRevenue, grossProfit: 0, netIncome: 0 },
      { month: "recent", revenue: baselineMonthlyRevenue, expensesByCategory: {}, totalExpenses: baselineMonthlyBurn + baselineMonthlyRevenue, grossProfit: 0, netIncome: 0 },
    ]);
    const fundraising = computeFundraisingReadiness(runway, revenueGrowthRate, syntheticBurnTrend);
    const covenant = computeCovenantStatus(
      {
        currentCashBalance: currentCash,
        baselineMonthlyRevenue,
        baselineRevenueGrowthRate: revenueGrowthRate,
        grossMarginPct: 0.7,
        covenantMinCashMonths: parseNumber(body.covenantMinCashMonths, 3),
        covenantMinCashBalance: parseNumber(body.covenantMinCashBalance, 250000),
      },
      runway,
    );

    return Response.json({ runway, fundraising, covenant });
  } catch (err) {
    return jsonError((err as Error).message, 500);
  }
}
