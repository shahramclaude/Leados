import {
  raiseInformationRequest,
  listRequests,
  informationRequestMetrics,
} from "@/lib/governance/informationRequests";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { assertAccess } from "@/lib/governance/access";
import { toErrorResponse } from "@/lib/governance/httpErrors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "information_request", "read");
    const { searchParams } = new URL(request.url);
    if (searchParams.get("metrics") === "1") {
      const metrics = await informationRequestMetrics();
      return Response.json({ ok: true, metrics });
    }
    const requests = await listRequests();
    return Response.json({ ok: true, requests });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "information_request", "write");
    const body = await request.json();
    const row = await raiseInformationRequest({
      requesterId: actor.id,
      subject: body.subject,
      requestText: body.requestText,
      targetTier: body.targetTier,
      dueInDays: body.dueInDays,
    });
    return Response.json({ ok: true, request: row });
  } catch (err) {
    return toErrorResponse(err);
  }
}
