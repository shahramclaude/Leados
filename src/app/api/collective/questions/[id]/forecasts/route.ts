import { NextRequest, NextResponse } from "next/server";
import { ensureForecaster, submitForecast } from "@/lib/collective/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { displayName, anonymousTag, probability, rationale, calibrationScore, brierScore, isAuthoritySignal } = body ?? {};

  if (!displayName || !anonymousTag || typeof probability !== "number") {
    return NextResponse.json(
      { error: "displayName, anonymousTag, and numeric probability are required" },
      { status: 400 },
    );
  }

  const forecaster = await ensureForecaster({
    displayName,
    anonymousTag,
    isAuthoritySignal: Boolean(isAuthoritySignal),
    calibrationScore,
    brierScore,
  });

  const forecast = await submitForecast({
    questionId: id,
    forecasterId: forecaster.id,
    probability,
    rationale,
  });

  return NextResponse.json({ forecast, forecaster }, { status: 201 });
}
