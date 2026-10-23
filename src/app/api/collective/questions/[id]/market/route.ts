import { NextRequest, NextResponse } from "next/server";
import { ensureForecaster, executeMarketTrade, getBeliefVsPrice, getMarketState } from "@/lib/collective/service";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [market, beliefVsPrice] = await Promise.all([getMarketState(id), getBeliefVsPrice(id)]);
  if (!market) return NextResponse.json({ error: "market not found" }, { status: 404 });
  return NextResponse.json({ market, beliefVsPrice });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { displayName, anonymousTag, side, shares, isAuthoritySignal } = body ?? {};

  if (!displayName || !anonymousTag || (side !== "YES" && side !== "NO") || typeof shares !== "number" || shares <= 0) {
    return NextResponse.json(
      { error: "displayName, anonymousTag, side ('YES'|'NO'), and positive numeric shares are required" },
      { status: 400 },
    );
  }

  const trader = await ensureForecaster({ displayName, anonymousTag, isAuthoritySignal: Boolean(isAuthoritySignal) });
  const outcome = await executeMarketTrade({ questionId: id, traderId: trader.id, side, shares });
  return NextResponse.json(outcome, { status: outcome.accepted ? 201 : 422 });
}
