import { NextRequest, NextResponse } from "next/server";
import { validateScenarioSpec } from "@/lib/scenario";
import { runScenario } from "@/lib/scenarioEngine";
import { createScenario, recordRun } from "@/lib/scenarios";
import { forecastCacheKey, getScenarioResultCache } from "@/lib/forecastCache";
import type { ScenarioRunResult } from "@/lib/scenarioEngine";

export const dynamic = "force-dynamic";

/**
 * POST /api/simulate
 * Body: ScenarioSpec (see src/lib/scenario.ts for the JSON schema).
 * Response: { ok, scenarioId, versionId, runId, result } where `result` is
 * a `ScenarioRunResult` — outcome distributions (p10/p50/p90 per KPI),
 * downsampled timeline traces, tornado sensitivity, early-warning
 * indicators and a template-based plain-language summary. Every number is
 * accompanied by `result.assumptions`, which MUST be shown alongside any
 * number surfaced in a UI (see docs/SIMULATION.md "Honesty rules").
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON" }, { status: 400 });
  }

  const validation = validateScenarioSpec(body);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: "Scenario spec failed validation", issues: validation.errors }, { status: 422 });
  }
  const spec = validation.spec;

  const cacheKey = forecastCacheKey(spec);
  const cache = getScenarioResultCache<ScenarioRunResult>();
  let result = cache.get(cacheKey);
  const start = Date.now();
  let cached = true;
  if (!result) {
    cached = false;
    try {
      result = await runScenario(spec);
    } catch (err) {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Simulation failed" }, { status: 500 });
    }
    cache.set(cacheKey, result);
  }
  const elapsedMs = Date.now() - start;

  let persistence: { scenarioId: string; versionId: string; runId: string } | null = null;
  try {
    const created = await createScenario(spec.name, `Auto-created from /api/simulate at ${new Date().toISOString()}`, spec);
    const runId = await recordRun({
      scenarioId: created.scenarioId,
      versionId: created.versionId,
      seedRoot: result.assumptions.seedRoot,
      replications: result.assumptions.replicationsPerVariant,
      durationMs: elapsedMs,
      result,
    });
    persistence = { scenarioId: created.scenarioId, versionId: created.versionId, runId };
  } catch (err) {
    // Persistence is best-effort: a DB hiccup should not prevent returning
    // a computed result to the caller, but we surface it clearly.
    return NextResponse.json({
      ok: true,
      cached,
      persisted: false,
      persistenceError: err instanceof Error ? err.message : String(err),
      result,
    });
  }

  return NextResponse.json({ ok: true, cached, persisted: true, ...persistence, result });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST a ScenarioSpec JSON body to run the digital twin. See src/lib/scenario.ts for the schema and docs/SIMULATION.md for worked examples.",
  });
}
