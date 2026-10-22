import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { addCorrection } from "@/lib/decision/decisionEngine";

export const dynamic = "force-dynamic";

// POST /api/decisions/[id]/correction -> append a correction EVENT. This is
// the only way to amend understanding of a committed decision: it never
// mutates the frozen record, it adds a new, timestamped, attributed event.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureDecisionInvariants();
  const { id } = await ctx.params;
  const body = await req.json();

  if (!body.correctionType || !body.note) {
    return Response.json({ error: "correctionType and note are required" }, { status: 400 });
  }

  const row = await addCorrection(id, body.correctionType, body.note, body.payload ?? {}, body.actorId ?? null);
  return Response.json({ correction: row }, { status: 201 });
}
