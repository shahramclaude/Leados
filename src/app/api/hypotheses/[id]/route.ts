import { NextResponse } from "next/server";
import {
  addEvidence,
  adjudicateDispute,
  getHypothesisWithEvidence,
  raiseDispute,
  resolveHypothesis,
  retireHypothesis,
  tryAutoResolve,
} from "@/lib/hypotheses";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getHypothesisWithEvidence(Number(id));
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}

// POST { action: "evidence"|"resolve"|"retire"|"auto-resolve"|"dispute"|"adjudicate", ... }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hypothesisId = Number(id);
  const body = (await request.json()) as Record<string, unknown>;

  try {
    switch (body.action) {
      case "evidence": {
        const result = await addEvidence({
          hypothesisId,
          description: String(body.description ?? ""),
          direction: body.direction === "against" ? "against" : "supports",
          likelihoodRatio: Number(body.likelihoodRatio),
          source: body.source ? String(body.source) : undefined,
        });
        return NextResponse.json(result);
      }
      case "resolve": {
        const row = await resolveHypothesis(hypothesisId, Boolean(body.outcome), "manual");
        return NextResponse.json(row);
      }
      case "auto-resolve": {
        const result = await tryAutoResolve(hypothesisId);
        return NextResponse.json(result);
      }
      case "retire": {
        const row = await retireHypothesis(hypothesisId);
        return NextResponse.json(row);
      }
      case "dispute": {
        const row = await raiseDispute(hypothesisId, String(body.raisedBy ?? "unknown"), String(body.reason ?? ""));
        return NextResponse.json(row, { status: 201 });
      }
      case "adjudicate": {
        const row = await adjudicateDispute(Number(body.disputeId), body.outcome === "overturned" ? "overturned" : "upheld", String(body.resolutionNote ?? ""));
        return NextResponse.json(row);
      }
      default:
        return NextResponse.json({ error: `unknown action "${String(body.action)}"` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
