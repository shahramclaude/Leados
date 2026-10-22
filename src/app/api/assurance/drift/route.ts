import { db } from "@/db";
import { driftSeries, metricObservations } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const metricKey = searchParams.get("metricKey");

  if (metricKey) {
    const observations = await db
      .select()
      .from(metricObservations)
      .where(eq(metricObservations.metricKey, metricKey))
      .orderBy(metricObservations.observedAt)
      .limit(60);
    const drift = await db
      .select()
      .from(driftSeries)
      .where(eq(driftSeries.metricKey, metricKey))
      .orderBy(desc(driftSeries.windowEnd))
      .limit(1);
    return Response.json({ metricKey, observations, latestDrift: drift[0] ?? null });
  }

  const latestPerMetric = await db.select().from(driftSeries).orderBy(desc(driftSeries.windowEnd)).limit(100);
  return Response.json({ driftSeries: latestPerMetric });
}
