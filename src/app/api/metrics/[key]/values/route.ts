import { db } from "@/db";
import { metricValues } from "@/db/schema";
import { cachedJson, jsonError, isRecord } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ key: string }> }
): Promise<Response> {
  const { key } = await context.params;
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.value !== "number" || !Number.isFinite(body.value)) {
    return jsonError("numeric value is required");
  }
  const [created] = await db
    .insert(metricValues)
    .values({ metricKey: key, value: String(body.value) })
    .returning();
  return cachedJson(created, { status: 201 });
}
