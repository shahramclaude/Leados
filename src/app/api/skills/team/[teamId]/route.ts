import { NextRequest } from "next/server";
import { teamSkillGapAnalysis } from "@/lib/skillsGraph";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await ctx.params;
    const actor = await resolveActor(req);
    const gaps = await teamSkillGapAnalysis(actor, teamId);
    return Response.json({ teamId, gaps });
  } catch (err) {
    return toErrorResponse(err);
  }
}
