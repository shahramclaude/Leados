import { getMetricsIntelligenceReport } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  try {
    const report = await getMetricsIntelligenceReport(new Date());
    const forecast = report.forecasts[key];
    if (!forecast) {
      return Response.json(
        { error: `No forecast available for metric '${key}' (needs >= 8 data points).` },
        { status: 404 },
      );
    }
    return Response.json(forecast);
  } catch (err) {
    console.error(`GET /api/metrics/forecast/${key} failed`, err);
    return Response.json({ error: "Failed to compute forecast" }, { status: 500 });
  }
}
