import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { frameDecision, markEvidenceGathered, InvalidMutationError } from "@/lib/decision/decisionEngine";

export const dynamic = "force-dynamic";

// POST /api/decisions/[id]/frame -> move raised -> framed (and optionally
// straight into evidence_gathered if optionEvidence intervals are supplied).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureDecisionInvariants();
  const { id } = await ctx.params;
  const body = await req.json();

  try {
    let decision = await frameDecision(
      id,
      {
        optionsConsidered: body.optionsConsidered ?? [],
        optionEvidence: body.optionEvidence ?? {},
        reversibilityPlan: body.reversibilityPlan,
      },
      body.actorId ?? null,
    );

    if (body.advanceToEvidenceGathered) {
      decision = await markEvidenceGathered(id, body.optionEvidence ?? {}, body.actorId ?? null);
    }

    return Response.json({ decision });
  } catch (err) {
    if (err instanceof InvalidMutationError) {
      return Response.json({ error: "invalid", message: err.message }, { status: 409 });
    }
    throw err;
  }
}
