import { NextRequest } from "next/server";
import { recordFeedback } from "@/lib/recommender/antiManipulation";
import { db } from "@/db";
import { recRecommendations } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * POST /api/recommender/feedback
 * body: { recommendationId, orgId, action: 'accept'|'reject', reason, reasonDetail? }
 *
 * This is pure engagement logging — see src/lib/recommender/antiManipulation.ts.
 * It deliberately never touches belief state. Accepting also flips the
 * recommendation's status so the Impact History surface can find it, but
 * that status flag itself is NOT read by the ranking engine.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.recommendationId !== "string" ||
    typeof body.orgId !== "string" ||
    (body.action !== "accept" && body.action !== "reject") ||
    typeof body.reason !== "string"
  ) {
    return Response.json(
      { ok: false, error: "recommendationId, orgId, action ('accept'|'reject'), and reason are required" },
      { status: 400 },
    );
  }

  await recordFeedback({
    recommendationId: body.recommendationId,
    orgId: body.orgId,
    action: body.action,
    reason: body.reason,
    reasonDetail: typeof body.reasonDetail === "string" ? body.reasonDetail : undefined,
  });

  await db
    .update(recRecommendations)
    .set({ status: body.action === "accept" ? "accepted" : "rejected" })
    .where(eq(recRecommendations.id, body.recommendationId));

  return Response.json({ ok: true });
}
