import { varianceAnalysis, derivedHistoricalPnL } from "@/lib/financialOS";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month) {
    const pnl = await derivedHistoricalPnL();
    const months = [...new Set(pnl.map((p) => p.month))].sort();
    return Response.json({ availableMonths: months, hint: "Pass ?month=YYYY-MM (not the first available month — there is no prior month to build a counterfactual plan from)." });
  }
  const result = await varianceAnalysis(month);
  if (!result) return Response.json({ error: "No prior month available to compute a plan counterfactual for this month." }, { status: 400 });
  return Response.json(result);
}
