import { NextRequest } from "next/server";
import { getOneOnOne, holdOneOnOne } from "@/lib/oneOnOne";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/** GET a single 1:1 doc. Private notes are redacted to null unless the
 * caller is the authoring manager or HR (declared policy, accessControl.ts). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = await resolveActor(req);
    const doc = await getOneOnOne(actor, id);
    return Response.json(doc);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** PATCH — hold the 1:1: set agenda/sharedNotes/privateNotes (optimistic-UI friendly: idempotent on id). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = await resolveActor(req);
    const body = await req.json();
    await holdOneOnOne(actor, id, {
      agenda: body.agenda,
      sharedNotes: body.sharedNotes,
      privateNotes: body.privateNotes,
    });
    const doc = await getOneOnOne(actor, id);
    return Response.json(doc);
  } catch (err) {
    return toErrorResponse(err);
  }
}
