import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { createPreMortem, listPreMortems } from "@/lib/decision/premortem";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureDecisionInvariants();
  const { id } = await ctx.params;
  const rows = await listPreMortems(id);
  return Response.json({ preMortems: rows });
}

// POST /api/decisions/[id]/premortem -> "assume this failed — why?"
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureDecisionInvariants();
  const { id } = await ctx.params;
  const body = await req.json();

  if (!Array.isArray(body.reasons) || body.reasons.length === 0) {
    return Response.json({ error: "reasons[] is required" }, { status: 400 });
  }

  const row = await createPreMortem({
    decisionId: id,
    reasons: body.reasons,
    mitigations: body.mitigations ?? [],
    createdBy: body.createdBy ?? null,
  });

  return Response.json({ preMortem: row }, { status: 201 });
}
