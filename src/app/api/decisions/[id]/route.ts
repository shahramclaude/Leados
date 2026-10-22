import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { getDecision } from "@/lib/decision/decisionEngine";
import { evidenceGapWarnings } from "@/lib/decision/decisionIntelligence";
import { listPreMortems } from "@/lib/decision/premortem";
import { listDQScores } from "@/lib/decision/decisionQualityStore";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureDecisionInvariants();
  const { id } = await ctx.params;
  const decision = await getDecision(id);
  if (!decision) return Response.json({ error: "not found" }, { status: 404 });

  const [preMortems, dqScores] = await Promise.all([listPreMortems(id), listDQScores(id)]);

  return Response.json({
    decision,
    warnings: evidenceGapWarnings(decision),
    preMortems,
    dqScores,
  });
}
