import { respondToRequest, closeRequest } from "@/lib/governance/informationRequests";
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
    assertAccess(actor.boardTier, "information_request", "write");
    const { id } = await params;
    const body = await request.json();

    if (body.action === "close") {
      const row = await closeRequest(Number(id), actor.id);
      return Response.json({ ok: true, request: row });
    }
    const row = await respondToRequest({
      requestId: Number(id),
      responseText: body.responseText,
      respondedBy: actor.id,
    });
    return Response.json({ ok: true, request: row });
  } catch (err) {
    return toErrorResponse(err);
  }
}
