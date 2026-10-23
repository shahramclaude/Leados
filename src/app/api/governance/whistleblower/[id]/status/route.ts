import { updateReportStatus } from "@/lib/governance/whistleblower";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { toErrorResponse } from "@/lib/governance/httpErrors";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    const { id } = await params;
    const body = await request.json();
    const row = await updateReportStatus({
      reportId: Number(id),
      tier: actor.boardTier,
      status: body.status,
    });
    return Response.json({ ok: true, report: row });
  } catch (err) {
    return toErrorResponse(err);
  }
}
