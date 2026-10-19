import { db } from "@/db";
import * as schema from "@/db/schema";
import { ensureBaselineData } from "@/lib/seed";
import { withErrorHandling, jsonOk } from "@/lib/api";
import { runCusum, pearsonCorrelation, runForecast } from "@/lib/metricsEngine";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("metrics", async (_req, requestId) => {
  await ensureBaselineData(db);

  const metricRows = await db.select().from(schema.metrics);

  const series = await Promise.all(
    metricRows.map(async (m) => {
      const points = await db
        .select()
        .from(schema.metricPoints)
        .where(eq(schema.metricPoints.metricId, m.id))
        .orderBy(asc(schema.metricPoints.ts));
      const values = points.map((p) => p.value);
      const anomalies = runCusum(values);
      const forecast = runForecast(values, 5);
      return {
        metric: m,
        points,
        anomalies,
        forecast,
      };
    }),
  );

  let correlation: number | null = null;
  if (series.length >= 2) {
    correlation = pearsonCorrelation(
      series[0].points.map((p) => p.value),
      series[1].points.map((p) => p.value),
    );
  }

  return jsonOk({ series, correlation }, requestId);
});
