import { db } from "@/db";
import { scenarios } from "@/db/schema";
import { desc } from "drizzle-orm";
import { cachedJson, jsonError, isRecord, parseNumber } from "@/lib/api";
import { runMonteCarloScenario } from "@/lib/scenario";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rows = await db.select().from(scenarios).orderBy(desc(scenarios.createdAt));
  return cachedJson(rows);
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.name !== "string" || body.name.trim() === "") {
    return jsonError("name is required");
  }
  const assumptions = {
    startingCash: parseNumber(isRecord(body.assumptions) ? body.assumptions.startingCash : undefined, 1500000),
    monthlyBurn: parseNumber(isRecord(body.assumptions) ? body.assumptions.monthlyBurn : undefined, 120000),
    monthlyRevenue: parseNumber(isRecord(body.assumptions) ? body.assumptions.monthlyRevenue : undefined, 40000),
    revenueGrowthRate: parseNumber(isRecord(body.assumptions) ? body.assumptions.revenueGrowthRate : undefined, 0.04),
    burnVolatility: parseNumber(isRecord(body.assumptions) ? body.assumptions.burnVolatility : undefined, 0.1),
    headcountDelta: parseNumber(isRecord(body.assumptions) ? body.assumptions.headcountDelta : undefined, 0),
    monthlyBurnDelta: parseNumber(isRecord(body.assumptions) ? body.assumptions.monthlyBurnDelta : undefined, 0),
    months: parseNumber(isRecord(body.assumptions) ? body.assumptions.months : undefined, 18),
  };

  const results = runMonteCarloScenario(assumptions);

  const [created] = await db
    .insert(scenarios)
    .values({
      name: body.name,
      assumptions,
      results: {
        projectedRunwayMonths: results.projectedRunwayMonths,
        runwayP10: results.runwayP10,
        runwayP90: results.runwayP90,
        probabilityOfRunningOutWithinHorizon: results.probabilityOfRunningOutWithinHorizon,
        projectedMrrDelta: results.projectedMrrDelta,
        simulations: results.simulations,
      },
    })
    .returning();
  return cachedJson(created, { status: 201 });
}
