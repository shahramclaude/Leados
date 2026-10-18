import { NextRequest } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { leadosScenarioRuns, leadosScenarios } from "@/db/schema";
import {
  buildStressTest,
  compareScenarios,
  defaultBaselineState,
  defineScenario,
  runScenario,
  STRESSOR_CATALOG,
  type BaselineState,
  type Scenario,
  type ScenarioAssumption,
  type ScenarioResult,
  type ScenarioStatus,
  type ScenarioType,
} from "@/lib/scenarioEngine";

export const dynamic = "force-dynamic";

function toScenario(row: typeof leadosScenarios.$inferSelect): Scenario {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ScenarioType,
    status: row.status as ScenarioStatus,
    description: row.description,
    assumptions: (row.assumptions as ScenarioAssumption[]) ?? [],
    variableOverrides: (row.variableOverrides as Scenario["variableOverrides"]) ?? {},
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

async function latestRunFor(scenarioId: string) {
  const rows = await db
    .select()
    .from(leadosScenarioRuns)
    .where(eq(leadosScenarioRuns.scenarioId, scenarioId))
    .orderBy(desc(leadosScenarioRuns.ranAt))
    .limit(1);
  return rows[0] ?? null;
}

async function persistAndRun(scenarioRow: typeof leadosScenarios.$inferSelect, iterations: number) {
  const scenario = toScenario(scenarioRow);
  const start = Date.now();
  const result = runScenario(scenario, defaultBaselineState(), iterations);
  const durationMs = Date.now() - start;

  const [run] = await db
    .insert(leadosScenarioRuns)
    .values({
      scenarioId: scenario.id,
      result: result as unknown as object,
      mcIterations: iterations,
      durationMs,
    })
    .returning();

  return { result, run };
}

// GET /api/scenarios            -> list scenarios + latest run summary
// GET /api/scenarios?id=xxx     -> scenario detail + run history
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const [row] = await db.select().from(leadosScenarios).where(eq(leadosScenarios.id, id)).limit(1);
    if (!row) return Response.json({ error: "Scenario not found" }, { status: 404 });
    const runs = await db
      .select()
      .from(leadosScenarioRuns)
      .where(eq(leadosScenarioRuns.scenarioId, id))
      .orderBy(desc(leadosScenarioRuns.ranAt));
    return Response.json({ scenario: row, runs });
  }

  const rows = await db.select().from(leadosScenarios).orderBy(desc(leadosScenarios.createdAt));
  const scenarios = await Promise.all(
    rows.map(async (row) => {
      const latest = await latestRunFor(row.id);
      return {
        ...row,
        lastRunAt: latest?.ranAt ?? null,
        lastRunResult: (latest?.result as ScenarioResult | undefined) ?? null,
      };
    }),
  );

  return Response.json({ scenarios, stressorCatalog: STRESSOR_CATALOG, baseline: defaultBaselineState() });
}

// POST /api/scenarios
// body: { action: "create", name, description?, type, assumptions, variableOverrides, createdBy?, status?, run?, monteCarloIterations? }
// body: { action: "run", scenarioId, monteCarloIterations? }
// body: { action: "compare", scenarioIds: string[], monteCarloIterations? }
// body: { action: "stressTest", stressorIds: string[], monteCarloIterations? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action ?? "create";

  if (action === "create") {
    const {
      name,
      description = "",
      type = "base",
      assumptions = [],
      variableOverrides = {},
      createdBy = "anonymous",
      status = "draft",
      run = false,
      monteCarloIterations = 5000,
    } = body;

    if (!name || typeof name !== "string") {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    const [row] = await db
      .insert(leadosScenarios)
      .values({
        name,
        description,
        type,
        status,
        assumptions,
        variableOverrides,
        createdBy,
      })
      .returning();

    if (!run) return Response.json({ scenario: row }, { status: 201 });

    const { result, run: runRow } = await persistAndRun(row, monteCarloIterations);
    return Response.json({ scenario: row, result, run: runRow }, { status: 201 });
  }

  if (action === "run") {
    const { scenarioId, monteCarloIterations = 5000 } = body;
    const [row] = await db.select().from(leadosScenarios).where(eq(leadosScenarios.id, scenarioId)).limit(1);
    if (!row) return Response.json({ error: "Scenario not found" }, { status: 404 });

    const { result, run } = await persistAndRun(row, monteCarloIterations);

    if (row.status === "draft") {
      await db.update(leadosScenarios).set({ status: "active", updatedAt: new Date() }).where(eq(leadosScenarios.id, row.id));
    }

    return Response.json({ result, run });
  }

  if (action === "compare") {
    const { scenarioIds, monteCarloIterations = 5000 } = body as { scenarioIds: string[]; monteCarloIterations?: number };
    if (!Array.isArray(scenarioIds) || scenarioIds.length < 2 || scenarioIds.length > 3) {
      return Response.json({ error: "Provide 2 or 3 scenarioIds to compare" }, { status: 400 });
    }

    const rows = await db.select().from(leadosScenarios).where(inArray(leadosScenarios.id, scenarioIds));
    const results: ScenarioResult[] = [];
    for (const scenarioId of scenarioIds) {
      const row = rows.find((r) => r.id === scenarioId);
      if (!row) continue;
      const latest = await latestRunFor(row.id);
      if (latest) {
        results.push(latest.result as ScenarioResult);
      } else {
        const { result } = await persistAndRun(row, monteCarloIterations);
        results.push(result);
      }
    }

    const comparison = compareScenarios(results);
    return Response.json({ comparison, results });
  }

  if (action === "stressTest") {
    const { stressorIds, monteCarloIterations = 3000 } = body as { stressorIds: string[]; monteCarloIterations?: number };
    const chosen = STRESSOR_CATALOG.filter((s) => !Array.isArray(stressorIds) || stressorIds.length === 0 || stressorIds.includes(s.id));
    const scenarios = buildStressTest(chosen);

    const out: { scenario: typeof leadosScenarios.$inferSelect; result: ScenarioResult }[] = [];
    for (const scenario of scenarios) {
      const [row] = await db
        .insert(leadosScenarios)
        .values({
          name: scenario.name,
          description: scenario.description,
          type: scenario.type,
          status: scenario.status,
          assumptions: scenario.assumptions,
          variableOverrides: scenario.variableOverrides,
          createdBy: body.createdBy ?? "stress-test-wizard",
        })
        .returning();
      const { result } = await persistAndRun(row, monteCarloIterations);
      out.push({ scenario: row, result });
    }

    out.sort((a, b) => a.result.expectedOutcomeScore - b.result.expectedOutcomeScore);
    return Response.json({ runs: out });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

// PATCH /api/scenarios  body: { id, status?, name?, description? }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, ...updates } = body as { id: string; status?: string; name?: string; description?: string };
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const [row] = await db
    .update(leadosScenarios)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(leadosScenarios.id, id))
    .returning();

  if (!row) return Response.json({ error: "Scenario not found" }, { status: 404 });
  return Response.json({ scenario: row });
}

// DELETE /api/scenarios?id=xxx
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  await db.delete(leadosScenarios).where(and(eq(leadosScenarios.id, id)));
  return Response.json({ ok: true });
}

// Exported baseline for use by other server modules (e.g. wargame route not needed here).
export type { BaselineState };
