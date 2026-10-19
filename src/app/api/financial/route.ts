import { db } from "@/db";
import { ensureBaselineData } from "@/lib/seed";
import { withErrorHandling, jsonOk } from "@/lib/api";
import { runMonteCarloRunway, computeFundraisingReadiness } from "@/lib/financialIntel";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("financial", async (req, requestId) => {
  await ensureBaselineData(db);
  const url = new URL(req.url);
  const cashBalance = Number(url.searchParams.get("cashBalance") ?? 1_800_000);
  const burnRate = Number(url.searchParams.get("burnRate") ?? 180_000);
  const revenue = Number(url.searchParams.get("revenue") ?? 70_000);
  const revenueGrowth = Number(url.searchParams.get("revenueGrowth") ?? 0.04);

  const runway = runMonteCarloRunway({ cashBalance, burnRate, revenue, revenueGrowth }, 500, 42);
  const readiness = computeFundraisingReadiness({
    revenueGrowthRate: revenueGrowth,
    runwayMonths: runway.p50,
    grossMargin: 0.72,
    customerChurnRate: 0.025,
    teamCompleteness: 0.8,
    marketSizeScore: 0.75,
    existingInvestorSupport: 0.6,
  });

  return jsonOk({ inputs: { cashBalance, burnRate, revenue, revenueGrowth }, runway, readiness }, requestId);
});
