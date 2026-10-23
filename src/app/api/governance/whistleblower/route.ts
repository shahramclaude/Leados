import { submitReport, listReportsForTier } from "@/lib/governance/whistleblower";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { toErrorResponse } from "@/lib/governance/httpErrors";

export const dynamic = "force-dynamic";

// Submission is deliberately open (no actor/tier required) — that is the
// point of a safe whistleblower channel. Reading the channel is tier-gated
// inside listReportsForTier.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await submitReport({ subject: body.subject, body: body.body });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function GET(request: Request) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    const reports = await listReportsForTier(actor.boardTier);
    return Response.json({ ok: true, reports });
  } catch (err) {
    return toErrorResponse(err);
  }
}
