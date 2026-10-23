import { getResolutionFull } from "@/lib/governance/resolutions";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { assertAccess } from "@/lib/governance/access";
import { toErrorResponse } from "@/lib/governance/httpErrors";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "resolution_register", "read");
    const { id } = await params;
    const result = await getResolutionFull(Number(id));
    if (!result) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
