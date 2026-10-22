import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { commitDecision, InvalidMutationError } from "@/lib/decision/decisionEngine";

export const dynamic = "force-dynamic";

// POST /api/decisions/[id]/commit -> freezes the decision record. No mutation
// path exists for frozen fields after this call succeeds (DB trigger + app
// guard). Attempting to commit an already-committed decision returns 409.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureDecisionInvariants();
  const { id } = await ctx.params;
  const body = await req.json();

  const required = ["chosen", "choiceRationale", "expectedOutcome", "confidenceClass", "reviewAt", "decidedBy"];
  for (const key of required) {
    if (!body[key]) return Response.json({ error: `${key} is required` }, { status: 400 });
  }

  try {
    const decision = await commitDecision(id, {
      chosen: body.chosen,
      choiceRationale: body.choiceRationale,
      expectedOutcome: body.expectedOutcome,
      expectedInterval: body.expectedInterval,
      confidenceClass: body.confidenceClass,
      reviewAt: body.reviewAt,
      decidedBy: body.decidedBy,
      triggerConditions: body.triggerConditions ?? [],
    });
    return Response.json({ decision });
  } catch (err) {
    if (err instanceof InvalidMutationError) {
      return Response.json({ error: "invalid", message: err.message }, { status: 409 });
    }
    throw err;
  }
}
