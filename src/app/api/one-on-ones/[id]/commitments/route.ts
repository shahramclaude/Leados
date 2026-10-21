import { NextRequest } from "next/server";
import { addCommitment, resolveCommitment } from "@/lib/oneOnOne";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = await resolveActor(req);
    const body = await req.json();
    const commitmentId = await addCommitment(actor, id, body.ownerId, body.description, body.dueDate);
    return Response.json({ id: commitmentId }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveActor(req);
    const body = await req.json();
    await resolveCommitment(actor, body.commitmentId, body.status);
    return Response.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
