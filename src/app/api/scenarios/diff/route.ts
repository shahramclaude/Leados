import { NextRequest, NextResponse } from "next/server";
import { diffScenarioRuns } from "@/lib/scenarios";

export const dynamic = "force-dynamic";

/**
 * GET /api/scenarios/diff?a=<runIdA>&b=<runIdB>
 * Structural diff of the two runs' scenario specs (interventions added /
 * removed / changed) plus a ranked KPI delta table and both runs' tornado
 * sensitivity rankings, so a UI can render a side-by-side comparison.
 */
export async function GET(req: NextRequest) {
  const a = req.nextUrl.searchParams.get("a");
  const b = req.nextUrl.searchParams.get("b");
  if (!a || !b) {
    return NextResponse.json({ ok: false, error: "Query params 'a' and 'b' (scenario run ids) are required" }, { status: 400 });
  }
  try {
    const diff = await diffScenarioRuns(a, b);
    return NextResponse.json({ ok: true, diff });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Diff failed" }, { status: 404 });
  }
}
