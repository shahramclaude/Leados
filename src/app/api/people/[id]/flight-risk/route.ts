import { NextRequest } from "next/server";
import { getFlightRisk } from "@/lib/flightRisk";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/** GET /api/people/[id]/flight-risk — always returns Explain<probability>. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = await resolveActor(req);
    const asOfParam = req.nextUrl.searchParams.get("asOf");
    const asOf = asOfParam ? new Date(asOfParam) : new Date();
    const explain = await getFlightRisk(actor, id, asOf);
    return Response.json(explain);
  } catch (err) {
    return toErrorResponse(err);
  }
}
