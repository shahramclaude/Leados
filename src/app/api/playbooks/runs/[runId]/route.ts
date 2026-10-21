import { NextResponse } from "next/server";
import { completeRun, completeStep, failRun } from "@/lib/playbooksEngine";

export const dynamic = "force-dynamic";

// PATCH { action: "complete-step"|"complete-run"|"fail", stepOrder?, note?, outcomeDelta? }
export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const body = (await request.json()) as { action?: string; stepOrder?: number; note?: string; outcomeDelta?: number };
  try {
    if (body.action === "complete-step") {
      if (body.stepOrder === undefined) return NextResponse.json({ error: "stepOrder is required" }, { status: 400 });
      const row = await completeStep(Number(runId), body.stepOrder, body.note);
      return NextResponse.json(row);
    }
    if (body.action === "complete-run") {
      const row = await completeRun({ runId: Number(runId), outcomeDelta: body.outcomeDelta });
      return NextResponse.json(row);
    }
    if (body.action === "fail") {
      const row = await failRun(Number(runId));
      return NextResponse.json(row);
    }
    return NextResponse.json({ error: `unknown action "${body.action}"` }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
