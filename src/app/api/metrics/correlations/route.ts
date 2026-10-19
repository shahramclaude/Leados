import { getMetricsIntelligenceReport } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await getMetricsIntelligenceReport(new Date());
    return Response.json({
      correlationMatrix: report.correlationMatrix,
      causalHypotheses: report.causalHypotheses,
    });
  } catch (err) {
    console.error("GET /api/metrics/correlations failed", err);
    return Response.json({ error: "Failed to compute correlations" }, { status: 500 });
  }
}
