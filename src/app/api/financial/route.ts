import { buildOrchestratorResult } from "@/lib/orchestrator";
import { getFinancialIntelligenceReport } from "@/lib/financialReport";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await getFinancialIntelligenceReport();
    const orchestrator = buildOrchestratorResult({ financialHealthScore: report.financialHealthScore });

    return Response.json({
      runway: report.runway,
      costAttribution: report.costAttribution,
      financialHealthScore: report.financialHealthScore,
      latestPLEvent: report.latestPLEvent,
      burnTrend: report.burnTrend,
      currentCashBalance: report.currentCashBalance,
      baselineMonthlyRevenue: report.baselineMonthlyRevenue,
      baselineRevenueGrowthRate: report.baselineRevenueGrowthRate,
      monthlyBurnMean: report.monthlyBurnMean,
      monthlyBurnStdDev: report.monthlyBurnStdDev,
      orchestrator,
      generatedAt: report.generatedAt,
    });
  } catch (error) {
    console.error("GET /api/financial failed", error);
    return Response.json({ error: "Failed to build financial intelligence report" }, { status: 500 });
  }
}
