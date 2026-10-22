import { db } from "@/db";
import { anomalyAlerts, metricSeries } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureSeedData } from "@/lib/sensing/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeedData();
  const rows = await db
    .select({
      alert: anomalyAlerts,
      seriesName: metricSeries.name,
      seriesKey: metricSeries.key,
    })
    .from(anomalyAlerts)
    .innerJoin(metricSeries, eq(anomalyAlerts.seriesId, metricSeries.id))
    .orderBy(desc(anomalyAlerts.ts));
  return Response.json({ alerts: rows });
}
