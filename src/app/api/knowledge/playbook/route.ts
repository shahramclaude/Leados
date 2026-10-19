import { NextResponse } from "next/server";
import { db } from "@/db";
import { findSimilarPastPatterns, getFindingById } from "@/lib/knowledgeGraph";
import { buildAdaptivePlaybook } from "@/lib/playbooksEngine";
import type { BeliefFabricResult } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/knowledge/playbook?findingId=X → AdaptivePlaybook (generated on demand)
//
// NOTE: this project does not yet have a standalone belief-fabric / org
// health engine (those are earlier parts of the Leados pipeline that are
// not present in this repository snapshot). We derive a reasonable stand-in
// belief posterior + org health score directly from the finding so the
// adaptive playbook generator has real inputs to react to.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const findingIdRaw = searchParams.get("findingId");
  const findingId = findingIdRaw ? Number(findingIdRaw) : NaN;
  if (!findingIdRaw || Number.isNaN(findingId)) {
    return NextResponse.json({ error: "findingId query param (numeric) is required" }, { status: 400 });
  }

  try {
    const finding = await getFindingById(db, findingId);
    if (!finding) {
      return NextResponse.json({ error: `No finding with id ${findingId}` }, { status: 404 });
    }

    const pastPatterns = await findSimilarPastPatterns(finding, db, 365);

    const posteriorValue = Math.min(0.95, 0.3 + finding.severity * 0.13);
    const currentBeliefResult: BeliefFabricResult = {
      posteriors: { [`${finding.domain}_risk`]: posteriorValue },
      cascadeRisk: { p: Math.min(0.95, finding.severity / 6) },
    };
    const orgHealthScore = Math.max(10, 100 - finding.severity * 12);

    const playbook = buildAdaptivePlaybook(finding, pastPatterns, currentBeliefResult, orgHealthScore);
    return NextResponse.json(playbook);
  } catch (error) {
    console.error("GET /api/knowledge/playbook failed", error);
    return NextResponse.json({ error: "Failed to generate playbook" }, { status: 500 });
  }
}
