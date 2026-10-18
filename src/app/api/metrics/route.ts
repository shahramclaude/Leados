import { db } from "@/db";
import { leadosMetrics, leadosMetricDefinitions } from "@/db/schema";
import { computeMetricHealth, type MetricPoint } from "@/lib/metricsEngine";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const [rows, definitions] = await Promise.all([
    db.select().from(leadosMetrics).orderBy(asc(leadosMetrics.createdAt)),
    db.select().from(leadosMetricDefinitions).orderBy(asc(leadosMetricDefinitions.key)),
  ]);

  const defByKey = new Map(definitions.map((d) => [d.key, d]));
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byKey.get(r.key) ?? [];
    list.push(r);
    byKey.set(r.key, list);
  }

  const latest: Record<
    string,
    {
      value: number;
      createdAt: string;
      domain: string;
      note: string | null;
      unit: string | null;
      target: number | null;
      benchmark: number | null;
      isLeading: boolean | null;
    }
  > = {};
  const health: Record<string, ReturnType<typeof computeMetricHealth>> = {};
  const sparklines: Record<string, { date: string; value: number }[]> = {};

  for (const [key, list] of byKey.entries()) {
    const sorted = list.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const last = sorted[sorted.length - 1];
    const def = defByKey.get(key);
    latest[key] = {
      value: last.value,
      createdAt: last.createdAt.toISOString(),
      domain: last.domain,
      note: last.note,
      unit: last.unit ?? def?.unit ?? null,
      target: last.target ?? def?.target ?? null,
      benchmark: last.benchmark ?? def?.benchmark ?? null,
      isLeading: last.isLeading ?? def?.isLeading ?? null,
    };

    const points: MetricPoint[] = sorted.map((r) => ({ date: r.createdAt, value: r.value }));
    health[key] = computeMetricHealth(key, points, {
      target: latest[key].target,
      benchmark: latest[key].benchmark,
      unit: latest[key].unit,
      displayName: def?.displayName ?? key,
    });
    sparklines[key] = sorted.slice(-12).map((r) => ({ date: r.createdAt.toISOString(), value: r.value }));
  }

  return Response.json({ definitions, latest, health, sparklines });
}

export async function POST(req: Request) {
  const body = await req.json();
  const value = Number(body?.value);

  if (!body?.key || typeof body.key !== "string") {
    return Response.json({ error: "key is required" }, { status: 400 });
  }
  if (!Number.isFinite(value)) {
    return Response.json({ error: "value must be a finite number" }, { status: 400 });
  }

  // Inherit target/benchmark/unit from the catalog definition when the
  // reading itself doesn't specify one.
  const [def] = await db
    .select()
    .from(leadosMetricDefinitions)
    .where(eq(leadosMetricDefinitions.key, body.key))
    .limit(1);

  const [row] = await db
    .insert(leadosMetrics)
    .values({
      key: body.key,
      value,
      domain: body.domain ?? def?.domain ?? "ops",
      note: body.note ?? "",
      unit: body.unit ?? def?.unit ?? null,
      target: body.target != null ? Number(body.target) : (def?.target ?? null),
      benchmark: body.benchmark != null ? Number(body.benchmark) : (def?.benchmark ?? null),
      benchmarkSource: body.benchmarkSource ?? def?.benchmarkSource ?? null,
      isLeading: body.isLeading ?? def?.isLeading ?? null,
      formula: body.formula ?? def?.formula ?? null,
      tags: Array.isArray(body.tags) ? body.tags : (def?.tags ?? null),
    })
    .returning();

  return Response.json(row, { status: 201 });
}
