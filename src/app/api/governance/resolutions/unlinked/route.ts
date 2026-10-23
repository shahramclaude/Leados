import { findUnlinkedResolutions } from "@/lib/governance/resolutions";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { assertAccess } from "@/lib/governance/access";
import { toErrorResponse } from "@/lib/governance/httpErrors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "resolution_register", "read");
    const { searchParams } = new URL(request.url);
    const now = searchParams.get("now") ? new Date(searchParams.get("now")!) : new Date();
    const unlinked = await findUnlinkedResolutions(now);
    return Response.json({ ok: true, unlinked });
  } catch (err) {
    return toErrorResponse(err);
  }
}
