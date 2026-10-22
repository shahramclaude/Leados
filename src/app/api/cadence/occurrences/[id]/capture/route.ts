import { NextResponse } from "next/server";
import { CaptureValidationError, captureRitualOutcome } from "@/lib/cadence/capture";
import { computeEffectiveness } from "@/lib/cadence/effectiveness";
import type { CaptureInput } from "@/lib/cadence/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as CaptureInput;

  try {
    const result = await captureRitualOutcome(id, body);
    // Diagnostic only — computed immediately so the UI can show a
    // provisional number; it is recomputed later as actions complete.
    const effectiveness = await computeEffectiveness(id);
    return NextResponse.json({ result, effectiveness }, { status: 201 });
  } catch (err) {
    if (err instanceof CaptureValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
