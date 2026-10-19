import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { decisions as decisionsTable } from "@/db/schema";
import { valueDecisionOption } from "@/lib/realOptions";
import { simulateDecisionOutcomes } from "@/lib/monteCarlo";
import { toNumber } from "@/lib/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const [decision] = await db.select().from(decisionsTable).where(eq(decisionsTable.id, id));
  if (!decision) return NextResponse.json({ error: "Decision not found" }, { status: 404 });

  const now = new Date();
  const daysRemaining = decision.deadline
    ? Math.max(0, Math.round((new Date(decision.deadline).getTime() - now.getTime()) / 86_400_000))
    : 30;

  const impact = toNumber(decision.impact, 3);
  const probability = toNumber(decision.probability, 0.5);

  const option = valueDecisionOption({
    spot: impact * 25000 * probability,
    strike: toNumber(decision.optionCostToDecide, 10000),
    daysRemaining,
    volatility: toNumber(decision.optionVolatility, 0.35),
  });

  const outcomeDistribution = simulateDecisionOutcomes(decision, 1000);

  return NextResponse.json({ decision, option, outcomeDistribution });
}
