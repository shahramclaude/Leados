import { db } from "@/db";
import { metricDefs, metricValues } from "@/db/schema";
import { runOrchestrationPipeline } from "@/lib/orchestrator";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await runOrchestrationPipeline(new Date());

    const defs = await db.select().from(metricDefs);
    const allValues = await db.select().from(metricValues);

    // Last 14 points per metric so the grid's sparklines don't require an
    // extra round-trip per card. Full history is available via
    // /api/metrics/series/:key for the detail panel.
    const recentValues: Record<string, { recordedAt: string; value: number }[]> = {};
    for (const v of allValues) {
      if (!recentValues[v.metricKey]) recentValues[v.metricKey] = [];
      recentValues[v.metricKey].push({ recordedAt: v.recordedAt.toISOString(), value: v.value });
    }
    for (const key of Object.keys(recentValues)) {
      recentValues[key] = recentValues[key]
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
        .slice(-14);
    }

    return Response.json({ ...report, metricDefs: defs, recentValues });
  } catch (err) {
    console.error("GET /api/metrics failed", err);
    return Response.json({ error: "Failed to build metrics intelligence report" }, { status: 500 });
  }
}

interface PostBody {
  metricKey?: string;
  value?: number;
  recordedAt?: string;
}

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { metricKey, value } = body;
  if (!metricKey || typeof metricKey !== "string") {
    return Response.json({ error: "metricKey is required" }, { status: 400 });
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return Response.json({ error: "value must be a finite number" }, { status: 400 });
  }

  const def = await db.select().from(metricDefs).where(eq(metricDefs.key, metricKey)).limit(1);
  if (def.length === 0) {
    return Response.json({ error: `Unknown metricKey '${metricKey}' — no matching metric_defs row` }, { status: 400 });
  }

  const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date();
  if (Number.isNaN(recordedAt.getTime())) {
    return Response.json({ error: "recordedAt must be a valid date" }, { status: 400 });
  }

  const [inserted] = await db
    .insert(metricValues)
    .values({ metricKey, value, recordedAt })
    .returning();

  return Response.json({ metricValue: inserted }, { status: 201 });
}
