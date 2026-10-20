import { NextRequest, NextResponse } from "next/server";
import { getScenario, listRuns, listVersions } from "@/lib/scenarios";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const scenario = await getScenario(id);
  if (!scenario) return NextResponse.json({ ok: false, error: "Scenario not found" }, { status: 404 });
  const [versions, runs] = await Promise.all([listVersions(id), listRuns(id)]);
  return NextResponse.json({ ok: true, scenario, versions, runs });
}
