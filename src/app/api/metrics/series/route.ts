import { ensureSeedData, listSeriesWithLatest, runDetectionForAllSeries } from "@/lib/sensing/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeedData();
  const rows = await listSeriesWithLatest();
  return Response.json({ series: rows });
}

// Re-runs detection across all series (idempotent: existing alerts are not
// duplicated). Used by the Metric Monitor's "refresh" action and by the
// nightly batch job seam.
export async function POST() {
  await ensureSeedData();
  const inserted = await runDetectionForAllSeries();
  return Response.json({ ok: true, newAlerts: inserted });
}
