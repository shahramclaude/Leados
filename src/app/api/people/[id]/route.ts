import { NextRequest } from "next/server";
import { getPersonAggregate } from "@/lib/peopleIntel";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/** GET /api/people/[id]?asOf=ISO_DATE — canonical person aggregate, scoped
 * server-side (self / manager / HR). `asOf` reconstructs LEADOS's belief
 * state on that date from the event log. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = await resolveActor(req);
    const asOfParam = req.nextUrl.searchParams.get("asOf");
    const asOf = asOfParam ? new Date(asOfParam) : new Date();
    const aggregate = await getPersonAggregate(actor, id, asOf);
    return Response.json(aggregate);
  } catch (err) {
    return toErrorResponse(err);
  }
}
