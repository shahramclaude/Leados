import { NextRequest } from "next/server";
import { getPersonTimeline } from "@/lib/peopleIntel";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = await resolveActor(req);
    const timeline = await getPersonTimeline(actor, id);
    return Response.json({ personId: id, timeline });
  } catch (err) {
    return toErrorResponse(err);
  }
}
