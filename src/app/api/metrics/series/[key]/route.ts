import { db } from "@/db";
import { metricDefs, metricValues } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  try {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 360);

    const [def] = await db.select().from(metricDefs).where(eq(metricDefs.key, key)).limit(1);
    if (!def) {
      return Response.json({ error: `Unknown metric '${key}'` }, { status: 404 });
    }

    const values = await db
      .select()
      .from(metricValues)
      .where(eq(metricValues.metricKey, key))
      .orderBy(metricValues.recordedAt);

    const windowed = values.filter((v) => v.recordedAt >= since);

    return Response.json({
      metricDef: def,
      values: windowed.map((v) => ({ recordedAt: v.recordedAt.toISOString(), value: v.value })),
    });
  } catch (err) {
    console.error(`GET /api/metrics/series/${key} failed`, err);
    return Response.json({ error: "Failed to load metric series" }, { status: 500 });
  }
}
