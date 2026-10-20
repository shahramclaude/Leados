import { NextRequest, NextResponse } from "next/server";
import { validateScenarioSpec } from "@/lib/scenario";
import { runScenario } from "@/lib/scenarioEngine";
import { addScenarioVersion, recordRun } from "@/lib/scenarios";

export const dynamic = "force-dynamic";

/**
 * POST /api/scenarios/:id/versions — add a new version of an existing
 * scenario, run it, and persist the run. This is how Scenario Studio
 * "what if I tweak this" iterations are versioned for later diffing.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON" }, { status: 400 });
  }
  const parsed = body as { spec?: unknown; note?: string };
  const validation = validateScenarioSpec(parsed.spec ?? body);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: "Scenario spec failed validation", issues: validation.errors }, { status: 422 });
  }

  const { versionId, version } = await addScenarioVersion(id, validation.spec, parsed.note);
  const start = Date.now();
  const result = await runScenario(validation.spec);
  const runId = await recordRun({
    scenarioId: id,
    versionId,
    seedRoot: result.assumptions.seedRoot,
    replications: result.assumptions.replicationsPerVariant,
    durationMs: Date.now() - start,
    result,
  });

  return NextResponse.json({ ok: true, versionId, version, runId, result });
}
