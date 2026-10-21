import {
  getCompletionRateForecast,
  getCycleTimeForecast,
  getEngagementDriftForecast,
} from "@/lib/intelligence/forecastService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const [completionRate, cycleTime, engagementDrift] = await Promise.all([
      getCompletionRateForecast(),
      getCycleTimeForecast(),
      getEngagementDriftForecast(),
    ]);
    return Response.json({ completionRate, cycleTime, engagementDrift });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
