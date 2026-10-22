// Part 08 — GET: actual-vs-plan variance decomposition for one month
// (price/volume/mix on revenue, headcount/rate on opex categories).

import { NextRequest } from "next/server";
import { evaluateModel, varianceAtMonth, CUTOVER_INDEX } from "@/lib/finance/financeEngine";
import { MONTHS } from "@/lib/finance/timeline";
import { loadOverrideMap } from "@/lib/finance/overridesStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  const monthIndex = month && MONTHS.includes(month) ? MONTHS.indexOf(month) : CUTOVER_INDEX;
  const persisted = await loadOverrideMap();
  const model = evaluateModel(persisted);
  const variance = varianceAtMonth(model, monthIndex);
  return Response.json({ monthIndex, months: MONTHS, variance });
}
