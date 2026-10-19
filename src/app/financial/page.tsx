import { getFinancialIntelligenceReport } from "@/lib/financialReport";
import { buildOrchestratorResult } from "@/lib/orchestrator";
import FinancialView, { type FinancialApiResponse } from "@/views/FinancialView";

export const dynamic = "force-dynamic";

export default async function FinancialPage() {
  const report = await getFinancialIntelligenceReport();
  const orchestrator = buildOrchestratorResult({ financialHealthScore: report.financialHealthScore });

  const initial: FinancialApiResponse = {
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
    orchestrator: {
      overallHealthScore: orchestrator.overallHealthScore,
      pillarsIncluded: orchestrator.pillarsIncluded,
    },
    generatedAt: report.generatedAt,
  };

  return <FinancialView initial={initial} />;
}
