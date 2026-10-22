import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { reviewDecision, InvalidMutationError } from "@/lib/decision/decisionEngine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureDecisionInvariants();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  try {
    const decision = await reviewDecision(id, body.actorId ?? null);
    return Response.json({ decision });
  } catch (err) {
    if (err instanceof InvalidMutationError) {
      return Response.json({ error: "invalid", message: err.message }, { status: 409 });
    }
    throw err;
  }
}
