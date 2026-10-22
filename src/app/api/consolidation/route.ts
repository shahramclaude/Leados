import { db } from "@/db";
import { boardPacks, consolidationRuns, entities } from "@/db/schema";
import { buildBoardPackSummary, runConsolidation } from "@/lib/consolidation";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await db.select().from(consolidationRuns);
  const packs = await db.select().from(boardPacks);
  return Response.json({ runs, packs });
}

// Seam 4 proving endpoint: global entities flow into consolidation -> board pack.
export async function POST(request: Request) {
  const body = await request.json();
  const period: string | undefined = body?.period;
  if (!period) {
    return Response.json({ error: "period is required" }, { status: 400 });
  }

  const periodEntities = await db.select().from(entities).where(eq(entities.period, period));
  if (periodEntities.length === 0) {
    return Response.json({ error: `no entities recorded for period ${period}` }, { status: 422 });
  }

  const result = runConsolidation(
    periodEntities.map((e) => ({
      name: e.name,
      region: e.region,
      currency: e.currency,
      revenue: Number(e.revenue),
      costs: Number(e.costs),
      fxRateToUsd: Number(e.fxRateToUsd),
    })),
  );

  const [run] = await db
    .insert(consolidationRuns)
    .values({
      period,
      totalRevenueUsd: String(result.totalRevenueUsd),
      totalCostsUsd: String(result.totalCostsUsd),
      entityCount: result.entityCount,
      fxNotes: result.fxNotes,
      status: "final",
    })
    .returning();

  const summary = buildBoardPackSummary(period, result);
  const [pack] = await db
    .insert(boardPacks)
    .values({ period, consolidationRunId: run.id, summary })
    .returning();

  return Response.json({ run, pack }, { status: 201 });
}
