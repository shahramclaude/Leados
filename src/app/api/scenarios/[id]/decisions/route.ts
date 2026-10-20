import { NextRequest, NextResponse } from "next/server";
import { attachScenarioToDecision } from "@/lib/scenarios";

export const dynamic = "force-dynamic";

/**
 * POST /api/scenarios/:id/decisions — attach a scenario run to a decision
 * record (Part 10 seam STAND-IN; see src/db/schema.ts `decisions` table).
 * Body: { scenarioRunId, title, rationale?, decisionId? }
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON" }, { status: 400 });
  }
  const parsed = body as { scenarioRunId?: string; title?: string; rationale?: string; decisionId?: string };
  if (!parsed.scenarioRunId || !parsed.title) {
    return NextResponse.json({ ok: false, error: "'scenarioRunId' and 'title' are required" }, { status: 400 });
  }
  const decisionId = await attachScenarioToDecision({
    decisionId: parsed.decisionId,
    title: parsed.title,
    rationale: parsed.rationale,
    scenarioId: id,
    scenarioRunId: parsed.scenarioRunId,
  });
  return NextResponse.json({ ok: true, decisionId });
}
