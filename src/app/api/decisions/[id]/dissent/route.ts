import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { addDissent } from "@/lib/decision/decisionEngine";

export const dynamic = "force-dynamic";

// POST /api/decisions/[id]/dissent -> record dissent. Dissent is NEVER hidden
// behind the chosen option; added before commit it is snapshotted into the
// frozen record, after commit it is recorded as a visible, clearly-labelled
// "late dissent" addendum (honesty rule: no retrofitted rationale).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureDecisionInvariants();
  const { id } = await ctx.params;
  const body = await req.json();

  if (!body.whoName || !body.theCase) {
    return Response.json({ error: "whoName and theCase are required" }, { status: 400 });
  }

  const row = await addDissent(id, {
    who: body.who ?? null,
    whoName: body.whoName,
    theCase: body.theCase,
    response: body.response ?? null,
  });

  return Response.json({ dissent: row }, { status: 201 });
}
