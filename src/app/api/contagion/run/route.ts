import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contagionRuns, contagionScenarios, valueChainEdges, valueChainNodes } from "@/db/schema";
import { runStressScenario, SCENARIO_DEFAULT_PARAMS, type ScenarioType } from "@/lib/contagion/scenarios";
import type { CascadeGraph, CascadeParams } from "@/lib/contagion/cascade";

export const dynamic = "force-dynamic";

async function loadGraphForSegment(segmentId: number | null): Promise<CascadeGraph> {
  const nodes = await db
    .select()
    .from(valueChainNodes)
    .where(segmentId ? eq(valueChainNodes.segmentId, segmentId) : undefined);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const allEdges = await db.select().from(valueChainEdges);
  const edges = allEdges.filter((e) => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId));

  return {
    nodes: nodes.map((n) => ({ id: String(n.id), revenueWeight: n.revenueWeight })),
    edges: edges.map((e) => ({
      id: String(e.id),
      from: String(e.fromNodeId),
      to: String(e.toNodeId),
      weight: e.dependencyWeight,
      correlatedShockGroup: e.correlatedShockGroup,
    })),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const scenarioId = searchParams.get("scenarioId");
  const rows = await db
    .select()
    .from(contagionRuns)
    .where(scenarioId ? eq(contagionRuns.scenarioId, Number(scenarioId)) : undefined)
    .orderBy(desc(contagionRuns.createdAt))
    .limit(25);
  return Response.json({ runs: rows });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { scenarioId, baseProbabilityMultiplier, correlatedShockFactor, trials, seed } = body ?? {};

  if (!scenarioId) {
    return Response.json({ error: "scenarioId is required" }, { status: 400 });
  }

  const [scenario] = await db.select().from(contagionScenarios).where(eq(contagionScenarios.id, scenarioId)).limit(1);
  if (!scenario) {
    return Response.json({ error: `scenario ${scenarioId} not found` }, { status: 404 });
  }

  const graph = await loadGraphForSegment(scenario.segmentId);
  const defaults = SCENARIO_DEFAULT_PARAMS[scenario.type as ScenarioType] ?? scenario.defaultParams;

  const params: CascadeParams = {
    baseProbabilityMultiplier: Number(baseProbabilityMultiplier ?? defaults.baseProbabilityMultiplier),
    correlatedShockFactor: Number(correlatedShockFactor ?? defaults.correlatedShockFactor),
    trials: Number(trials ?? defaults.trials ?? 500),
  };
  const runSeed = Number.isFinite(Number(seed)) ? Number(seed) : 42;

  const seedNodeIds = (scenario.seedNodeIds as number[]).map(String);

  const output = runStressScenario(graph, seedNodeIds, scenario.type as ScenarioType, params, runSeed);

  const [row] = await db
    .insert(contagionRuns)
    .values({
      scenarioId: scenario.id,
      seed: runSeed,
      params,
      systemicExposureScore: output.systemicExposureScore,
      intervalLow: output.intervalLow,
      intervalHigh: output.intervalHigh,
      sensitivity: output.sensitivity,
      affectedNodeFrequency: output.affectedNodeFrequency,
      twinValidated: output.twinValidated,
      ensembleReconciled: output.ensembleReconciled,
      evidenceClass: "model_estimate",
    })
    .returning();

  return Response.json({ run: row, caveats: output.caveats });
}
