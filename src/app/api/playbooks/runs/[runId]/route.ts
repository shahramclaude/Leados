import { NextResponse } from "next/server";
import { completeRun, completeStep, failRun } from "@/lib/playbooksEngine";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const id = Number(runId);
  const body = (await request.json()) as
    | { action: "complete-step"; stepOrder: number; note?: string }
    | { action: "complete-run"; outcomeDelta?: number }
    | { action: "fail-run" };

  try {
    if (body.action === "complete-step") {
      const row = await completeStep(id, body.stepOrder, body.note);
      return NextResponse.json(row);
    }
    if (body.action === "complete-run") {
      const row = await completeRun({ runId: id, outcomeDelta: body.outcomeDelta });
      return NextResponse.json(row);
    }
    if (body.action === "fail-run") {
      const row = await failRun(id);
      return NextResponse.json(row);
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
