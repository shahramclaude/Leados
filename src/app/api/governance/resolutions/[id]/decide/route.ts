import { decideResolution } from "@/lib/governance/resolutions";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { assertAccess } from "@/lib/governance/access";
import { toErrorResponse } from "@/lib/governance/httpErrors";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "resolution_register", "write");
    const { id } = await params;
    const resolution = await decideResolution(Number(id));
    return Response.json({ ok: true, resolution });
  } catch (err) {
    return toErrorResponse(err);
  }
}
