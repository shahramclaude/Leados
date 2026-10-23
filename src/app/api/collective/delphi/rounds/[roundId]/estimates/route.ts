import { NextRequest, NextResponse } from "next/server";
import { ensureForecaster, submitDelphiEstimate } from "@/lib/collective/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const body = await req.json().catch(() => ({}));
  const { displayName, anonymousTag, estimate, rationale, isAuthoritySignal } = body ?? {};

  if (!displayName || !anonymousTag || typeof estimate !== "number") {
    return NextResponse.json(
      { error: "displayName, anonymousTag, and numeric estimate are required" },
      { status: 400 },
    );
  }

  const forecaster = await ensureForecaster({ displayName, anonymousTag, isAuthoritySignal: Boolean(isAuthoritySignal) });

  try {
    const row = await submitDelphiEstimate({
      roundId,
      forecasterId: forecaster.id,
      estimate,
      rationale: rationale ?? "",
    });
    return NextResponse.json({ estimate: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
