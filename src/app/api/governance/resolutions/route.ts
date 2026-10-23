import { draftResolution } from "@/lib/governance/resolutions";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { assertAccess } from "@/lib/governance/access";
import { toErrorResponse } from "@/lib/governance/httpErrors";
import { db } from "@/db";
import { resolutions } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(resolutions);
  return Response.json({ ok: true, resolutions: rows });
}

export async function POST(request: Request) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "resolution_register", "write");
    const body = await request.json();
    const resolution = await draftResolution({
      meetingId: body.meetingId,
      text: body.text,
      type: body.type,
      matterRef: body.matterRef ?? "",
      proposedBy: actor.id,
    });
    return Response.json({ ok: true, resolution });
  } catch (err) {
    return toErrorResponse(err);
  }
}
