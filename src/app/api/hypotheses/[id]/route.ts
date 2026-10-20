import { NextResponse } from "next/server";
import { addEvidence, getHypothesisWithEvidence, resolveHypothesis, retireHypothesis, type AddEvidenceInput } from "@/lib/hypotheses";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hypothesisId = Number(id);
  const detail = await getHypothesisWithEvidence(hypothesisId);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hypothesisId = Number(id);
  const body = (await request.json()) as
    | ({ action: "add-evidence" } & Omit<AddEvidenceInput, "hypothesisId">)
    | { action: "resolve"; outcome: boolean }
    | { action: "retire" };

  try {
    if (body.action === "add-evidence") {
      const result = await addEvidence({ hypothesisId, ...body });
      return NextResponse.json(result);
    }
    if (body.action === "resolve") {
      const row = await resolveHypothesis(hypothesisId, body.outcome);
      return NextResponse.json(row);
    }
    if (body.action === "retire") {
      const row = await retireHypothesis(hypothesisId);
      return NextResponse.json(row);
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
