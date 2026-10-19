import { db } from "@/db";
import { scenarios } from "@/db/schema";
import { desc } from "drizzle-orm";
import { jsonError, isRecord, parseNumber, parseString, readJsonBody } from "@/lib/api";
import { runScenario, deriveEarlyWarningIndicators, type ScenarioAssumptions } from "@/lib/scenarioEngine";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rows = await db.select().from(scenarios).orderBy(desc(scenarios.createdAt));
  return Response.json(rows);
}

export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (typeof body.name !== "string" || body.name.trim() === "") return jsonError("name is required");

  const rawAssumptions = isRecord(body.assumptions) ? body.assumptions : {};
  const assumptions: ScenarioAssumptions = {
    startingCash: parseNumber(rawAssumptions.startingCash, 1500000),
    monthlyBurn: parseNumber(rawAssumptions.monthlyBurn, 180000),
    monthlyRevenue: parseNumber(rawAssumptions.monthlyRevenue, 90000),
    revenueGrowthRate: parseNumber(rawAssumptions.revenueGrowthRate, 0.04),
    burnVolatility: parseNumber(rawAssumptions.burnVolatility, 0.18),
    headcountDelta: parseNumber(rawAssumptions.headcountDelta, 0),
    monthlyBurnDelta: parseNumber(rawAssumptions.monthlyBurnDelta, 0),
    months: parseNumber(rawAssumptions.months, 24),
    seed: parseNumber(rawAssumptions.seed, 1337),
  };

  const kind = parseString(body.kind, "finance");
  const result = runScenario(assumptions);
  const earlyWarningIndicators = deriveEarlyWarningIndicators(body.name, assumptions);

  const [created] = await db
    .insert(scenarios)
    .values({
      name: body.name,
      description: typeof body.description === "string" ? body.description : null,
      kind,
      assumptions,
      results: result.runway,
      earlyWarningIndicators,
      version: 1,
      parentScenarioId: null,
      decisionId: body.decisionId != null ? parseNumber(body.decisionId, 0) : null,
    })
    .returning();
  return Response.json(created, { status: 201 });
}
