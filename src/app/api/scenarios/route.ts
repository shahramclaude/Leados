import { NextRequest, NextResponse } from "next/server";
import { validateScenarioSpec } from "@/lib/scenario";
import { createScenario, listScenarios } from "@/lib/scenarios";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listScenarios();
  return NextResponse.json({ ok: true, scenarios: rows });
}

/**
 * POST /api/scenarios — persist a scenario spec WITHOUT running it
 * (use /api/simulate to run-and-persist in one call). Useful for the
 * Scenario Studio "save draft" flow.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON" }, { status: 400 });
  }
  const parsed = body as { name?: string; description?: string; spec?: unknown };
  const validation = validateScenarioSpec(parsed.spec ?? body);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: "Scenario spec failed validation", issues: validation.errors }, { status: 422 });
  }
  const created = await createScenario(parsed.name ?? validation.spec.name, parsed.description, validation.spec);
  return NextResponse.json({ ok: true, ...created });
}
