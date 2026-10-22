import { db } from "@/db";
import { anomalyAlerts, metricSeries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeedData } from "@/lib/sensing/db";
import { FALSE_POSITIVE_SOURCE } from "@/lib/sensing/falsePositiveRates";

export const dynamic = "force-dynamic";

const METHOD_EXPLANATIONS: Record<string, string> = {
  ewma: "EWMA control chart: z_t = lambda*x_t + (1-lambda)*z_{t-1}, flagged when |z_t - rolling mean| exceeds L*sigma*sqrt(lambda/(2-lambda)). Tuned lambda=0.25, L=2.7.",
  robust_z: "Robust z-score (median/MAD, Iglewicz & Hoaglin modified z-score) on raw values, plus a debounced check on first differences to catch abrupt slope changes. Threshold 4.5 (same for both channels).",
  seasonal_ewma: "Seasonal decomposition (centered moving average trend + per-phase seasonal index) with an EWMA control chart on the residual. Tuned lambda=0.35, L=2.3.",
};

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSeedData();
  const { id } = await context.params;
  const alertId = Number(id);
  if (!Number.isFinite(alertId)) {
    return Response.json({ error: "invalid alert id" }, { status: 400 });
  }
  const [row] = await db
    .select({ alert: anomalyAlerts, seriesName: metricSeries.name, seriesKey: metricSeries.key, unit: metricSeries.unit })
    .from(anomalyAlerts)
    .innerJoin(metricSeries, eq(anomalyAlerts.seriesId, metricSeries.id))
    .where(eq(anomalyAlerts.id, alertId));
  if (!row) {
    return Response.json({ error: "alert not found" }, { status: 404 });
  }
  return Response.json({
    alert: row.alert,
    series: { name: row.seriesName, key: row.seriesKey, unit: row.unit },
    methodExplanation: METHOD_EXPLANATIONS[row.alert.method] ?? "unknown method",
    falsePositiveSource: FALSE_POSITIVE_SOURCE,
  });
}
