import { NextRequest } from "next/server";
import { computeTeamHealth } from "@/lib/teamHealth";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await ctx.params;
    const actor = await resolveActor(req);
    const radar = await computeTeamHealth(actor, teamId);
    return Response.json(radar);
  } catch (err) {
    return toErrorResponse(err);
  }
}
