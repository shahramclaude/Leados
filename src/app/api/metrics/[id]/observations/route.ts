import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { metricObservations, metrics } from "@/db/schema";
import { createObservationSchema } from "@/lib/validation";
import { getObservations } from "@/lib/worldModel";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return Response.json({ error: "invalid_metric_id" }, { status: 400 });

  const points = await getObservations(params.data.id);
  return Response.json({ observations: points });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return Response.json({ error: "invalid_metric_id" }, { status: 400 });

  const metricRows = await db.select().from(metrics).where(eq(metrics.id, params.data.id)).limit(1);
  if (metricRows.length === 0) return Response.json({ error: "metric_not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = createObservationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const [row] = await db
    .insert(metricObservations)
    .values({ metricId: params.data.id, period: parsed.data.period, value: String(parsed.data.value) })
    .returning();
  return Response.json({ observation: row }, { status: 201 });
}
