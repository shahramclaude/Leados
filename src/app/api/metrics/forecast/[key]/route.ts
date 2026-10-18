import { db } from "@/db";
import { leadosForecasts, leadosMetrics } from "@/db/schema";
import { forecastMetric, type MetricPoint } from "@/lib/metricsEngine";
import { cacheGet, cacheSet, ONE_HOUR_MS } from "@/lib/forecastCache";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const decodedKey = decodeURIComponent(key);
  const { searchParams } = new URL(req.url);
  const horizon = Math.max(1, Math.min(180, Number(searchParams.get("horizon") ?? 30) || 30));

  const cacheKey = `forecast:${decodedKey}:${horizon}`;
  const cached = cacheGet<Awaited<ReturnType<typeof forecastMetric>>>(cacheKey);
  if (cached) {
    return Response.json({ ...cached, cached: true });
  }

  const rows = await db
    .select()
    .from(leadosMetrics)
    .where(eq(leadosMetrics.key, decodedKey))
    .orderBy(asc(leadosMetrics.createdAt));

  if (!rows.length) {
    return Response.json({ error: `No history found for metric "${decodedKey}"` }, { status: 404 });
  }

  const points: MetricPoint[] = rows.map((r) => ({ date: r.createdAt, value: r.value }));
  const forecast = forecastMetric(decodedKey, points, horizon);

  cacheSet(cacheKey, forecast, ONE_HOUR_MS);

  // Persist the latest forecast run for audit/history purposes (best effort).
  try {
    await db.insert(leadosForecasts).values({
      metricKey: decodedKey,
      method: forecast.method,
      horizonDays: horizon,
      predictedValues: forecast.values.map((v) => ({ date: v.date, p50: v.p50 })),
      confidenceIntervals: forecast.values.map((v) => ({ date: v.date, p10: v.p10, p90: v.p90 })),
      accuracyScore: forecast.accuracy,
    });
  } catch {
    // Non-fatal: forecast persistence is best-effort only.
  }

  return Response.json({ ...forecast, cached: false });
}
