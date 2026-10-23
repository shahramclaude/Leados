import { freezeNumbers } from "@/lib/governance/packAssembly";
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
    assertAccess(actor.boardTier, "board_pack_full", "write");
    const { id } = await params;
    const body = await request.json();
    const pack = await freezeNumbers(Number(id), body.snapshot ?? {});
    return Response.json({ ok: true, pack });
  } catch (err) {
    return toErrorResponse(err);
  }
}
