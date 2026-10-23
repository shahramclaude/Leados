import { recordEffectivenessReview } from "@/lib/governance/resolutions";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { assertAccess } from "@/lib/governance/access";
import { toErrorResponse } from "@/lib/governance/httpErrors";
import { db } from "@/db";
import { oversightMilestones, effectivenessReviews } from "@/db/schema";
import { eq } from "drizzle-orm";

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
    const milestones = await db
      .select()
      .from(oversightMilestones)
      .where(eq(oversightMilestones.resolutionId, Number(id)));
    const reviews = await db
      .select()
      .from(effectivenessReviews)
      .where(eq(effectivenessReviews.resolutionId, Number(id)));
    return Response.json({ ok: true, milestones, reviews });
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
    assertAccess(actor.boardTier, "resolution_register", "write");
    const { id } = await params;
    const body = await request.json();
    const review = await recordEffectivenessReview({
      resolutionId: Number(id),
      milestoneId: body.milestoneId,
      outcome: body.outcome,
      notes: body.notes ?? "",
      reviewedBy: actor.id,
    });
    return Response.json({ ok: true, review });
  } catch (err) {
    return toErrorResponse(err);
  }
}
