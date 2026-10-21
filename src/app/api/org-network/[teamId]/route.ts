import { NextRequest } from "next/server";
import { collaborationLoad, busFactor, communicationBottlenecks } from "@/lib/orgNetwork";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/** GET /api/org-network/[teamId] — collaboration metadata only (Part 09-F hard rule). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await ctx.params;
    const actor = await resolveActor(req);
    const [load, bus, bottlenecks] = await Promise.all([
      collaborationLoad(actor, teamId),
      busFactor(actor, teamId),
      communicationBottlenecks(actor, teamId),
    ]);
    return Response.json({ teamId, collaborationLoad: load, busFactor: bus, bottlenecks });
  } catch (err) {
    return toErrorResponse(err);
  }
}
