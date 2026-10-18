import { db } from "@/db";
import { metricDefs, metricValues } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { cachedJson, jsonError, isRecord } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const defs = await db.select().from(metricDefs).orderBy(metricDefs.label);
  const withSeries = await Promise.all(
    defs.map(async (d) => {
      const rows = await db
        .select()
        .from(metricValues)
        .where(eq(metricValues.metricKey, d.key))
        .orderBy(desc(metricValues.recordedAt))
        .limit(12);
      return { ...d, series: rows.reverse() };
    })
  );
  return cachedJson(withSeries);
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.key !== "string" || body.key.trim() === "") {
    return jsonError("key is required");
  }
  if (typeof body.label !== "string" || body.label.trim() === "") {
    return jsonError("label is required");
  }
  if (typeof body.domain !== "string" || body.domain.trim() === "") {
    return jsonError("domain is required");
  }
  const [created] = await db
    .insert(metricDefs)
    .values({
      key: body.key,
      label: body.label,
      domain: body.domain,
      unit: typeof body.unit === "string" ? body.unit : "",
      target: typeof body.target === "number" ? String(body.target) : "0",
      benchmark: typeof body.benchmark === "number" ? String(body.benchmark) : "0",
      direction: typeof body.direction === "string" ? body.direction : "higher_better",
    })
    .returning();
  return cachedJson(created, { status: 201 });
}

export async function PATCH(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.key !== "string") return jsonError("key is required");
  const patch: Partial<typeof metricDefs.$inferInsert> = {};
  if (typeof body.target === "number") patch.target = String(body.target);
  if (typeof body.benchmark === "number") patch.benchmark = String(body.benchmark);
  const [updated] = await db.update(metricDefs).set(patch).where(eq(metricDefs.key, body.key)).returning();
  if (!updated) return jsonError("metric not found", 404);
  return cachedJson(updated);
}
