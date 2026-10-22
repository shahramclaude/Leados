import { db } from "@/db";
import { metrics } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domainId = searchParams.get("domainId");
  const rows = domainId
    ? await db.select().from(metrics).where(eq(metrics.domainId, Number(domainId)))
    : await db.select().from(metrics);
  return Response.json({ metrics: rows });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.domainId || !body?.name || body?.value === undefined || body?.target === undefined || !body?.unit || !body?.period) {
    return Response.json(
      { error: "domainId, name, value, target, unit, period are required" },
      { status: 400 },
    );
  }
  const [row] = await db
    .insert(metrics)
    .values({
      domainId: Number(body.domainId),
      name: body.name,
      value: String(body.value),
      target: String(body.target),
      unit: body.unit,
      period: body.period,
    })
    .returning();
  return Response.json({ metric: row }, { status: 201 });
}
