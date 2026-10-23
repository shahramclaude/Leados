import { runCompletenessCheck, getPackWithSections } from "@/lib/governance/packAssembly";
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
    assertAccess(actor.boardTier, "board_pack_full", "read");
    const { id } = await params;
    const result = await getPackWithSections(Number(id));
    if (!result) return Response.json({ ok: false, error: "Pack not found" }, { status: 404 });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "board_pack_full", "write");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await runCompletenessCheck(Number(id), body.tier ?? "main_board");
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
