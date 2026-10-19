import { db } from "@/db";
import { scenarios } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { jsonError, isRecord, parseNumber, readJsonBody } from "@/lib/api";
import { runScenario, deriveEarlyWarningIndicators, type ScenarioAssumptions } from "@/lib/scenarioEngine";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenarioId = Number(id);
  if (!Number.isFinite(scenarioId)) return jsonError("Invalid scenario id");
  const [row] = await db.select().from(scenarios).where(eq(scenarios.id, scenarioId)).limit(1);
  if (!row) return jsonError("Scenario not found", 404);
  const versions = await db.select().from(scenarios).where(eq(scenarios.parentScenarioId, row.parentScenarioId ?? row.id)).orderBy(desc(scenarios.version));
  return Response.json({ scenario: row, versions });
}

// Forks a new version of a scenario with overridden assumptions, preserving history.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenarioId = Number(id);
  if (!Number.isFinite(scenarioId)) return jsonError("Invalid scenario id");
  const [existing] = await db.select().from(scenarios).where(eq(scenarios.id, scenarioId)).limit(1);
  if (!existing) return jsonError("Scenario not found", 404);

  const body = await readJsonBody(request);
  const overrides = isRecord(body.assumptions) ? body.assumptions : {};
  const base = existing.assumptions as ScenarioAssumptions;
  const assumptions: ScenarioAssumptions = {
    startingCash: parseNumber(overrides.startingCash, base.startingCash),
    monthlyBurn: parseNumber(overrides.monthlyBurn, base.monthlyBurn),
    monthlyRevenue: parseNumber(overrides.monthlyRevenue, base.monthlyRevenue),
    revenueGrowthRate: parseNumber(overrides.revenueGrowthRate, base.revenueGrowthRate),
    burnVolatility: parseNumber(overrides.burnVolatility, base.burnVolatility),
    headcountDelta: parseNumber(overrides.headcountDelta, base.headcountDelta),
    monthlyBurnDelta: parseNumber(overrides.monthlyBurnDelta, base.monthlyBurnDelta),
    months: parseNumber(overrides.months, base.months),
    seed: parseNumber(overrides.seed, base.seed ?? 1337),
  };

  const result = runScenario(assumptions);
  const earlyWarningIndicators = deriveEarlyWarningIndicators(existing.name, assumptions);
  const parentId = existing.parentScenarioId ?? existing.id;

  const [created] = await db
    .insert(scenarios)
    .values({
      name: existing.name,
      description: existing.description,
      kind: existing.kind,
      assumptions,
      results: result.runway,
      earlyWarningIndicators,
      version: existing.version + 1,
      parentScenarioId: parentId,
      decisionId: existing.decisionId,
    })
    .returning();
  return Response.json(created, { status: 201 });
}
