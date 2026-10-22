import { db } from "@/db";
import { entities } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(entities);
  return Response.json({ entities: rows });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.name || !body?.region || !body?.currency || !body?.period) {
    return Response.json({ error: "name, region, currency, period are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(entities)
    .values({
      name: body.name,
      region: body.region,
      currency: body.currency,
      revenue: String(body.revenue ?? 0),
      costs: String(body.costs ?? 0),
      fxRateToUsd: String(body.fxRateToUsd ?? 1),
      period: body.period,
    })
    .returning();
  return Response.json({ entity: row }, { status: 201 });
}
