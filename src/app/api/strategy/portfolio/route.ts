import { NextRequest } from "next/server";
import { listInitiatives } from "@/lib/strategy/initiatives";
import { rankInitiatives, selectPortfolio, WSJF_TIE_BREAK_RULES } from "@/lib/strategy/initiativesEngine";
import { WSJF_DIMENSION_ANCHORS } from "@/lib/strategy/strategyModels";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const budgetParam = req.nextUrl.searchParams.get("budget");
  const budget = budgetParam ? Number(budgetParam) : 500000;

  const initiatives = await listInitiatives();
  const ranked = rankInitiatives(initiatives);
  const selection = selectPortfolio(initiatives, budget);

  return Response.json({
    budget,
    ranked: ranked.map((r, idx) => ({ rank: idx + 1, ...r })),
    selection,
    tieBreakRules: WSJF_TIE_BREAK_RULES,
    anchors: WSJF_DIMENSION_ANCHORS,
  });
}
