import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { recordDQScore, listDQScores } from "@/lib/decision/decisionQualityStore";
import { autoSuggestDQ } from "@/lib/decision/decisionQuality";
import { getDecision } from "@/lib/decision/decisionEngine";

export const dynamic = "force-dynamic";

// GET /api/decisions/[id]/score -> history + auto-suggested floor
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureDecisionInvariants();
  const { id } = await ctx.params;
  const decision = await getDecision(id);
  if (!decision) return Response.json({ error: "not found" }, { status: 404 });

  const [history, auto] = await Promise.all([listDQScores(id), Promise.resolve(autoSuggestDQ(decision))]);
  return Response.json({ history, auto });
}

// POST /api/decisions/[id]/score -> a rater submits a DQ score (diagnostic,
// per decision — never per person). Scoring is append-only (history kept).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureDecisionInvariants();
  const { id } = await ctx.params;
  const body = await req.json();

  if (!body.scoredBy) return Response.json({ error: "scoredBy is required" }, { status: 400 });

  const { row, result } = await recordDQScore(id, {
    scores: body.scores ?? {},
    scoredBy: body.scoredBy,
    notes: body.notes ?? "",
  });

  return Response.json({ score: row, result }, { status: 201 });
}
