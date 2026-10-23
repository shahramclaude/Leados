import { NextRequest } from "next/server";
import { isValidCommitmentFollowThrough } from "@/lib/commitments";
import { getInterventionBySlug, getInterventionById } from "@/lib/recommender/registry";
import { recordSelfReport, recordVerifiedOutcome } from "@/lib/recommender/beliefUpdate";
import { canonicalizeContext } from "@/lib/router/context";
import type { Context } from "@/lib/recommender/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/recommender/outcome
 *
 * Two accepted shapes:
 *
 * 1. Verified commitment follow-through (Part 48 stand-in shape):
 *    { commitmentId, orgId, interventionId|interventionSlug, completed, measuredEffect?, measuredAt,
 *      context, recommendationId? }
 *    -> only updates belief if `completed === true`; a measured non-completion
 *       (completed:false) is recorded as a verified *negative* outcome.
 *
 * 2. Experiment result (Part 30 stand-in shape):
 *    { experimentId, interventionId|interventionSlug, context, success, magnitude?, recommendationId? }
 *
 * 3. Self report (never updates beliefs, logged only):
 *    { selfReport: true, interventionId|interventionSlug, context, success, recommendationId? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const intervention = body.interventionId
    ? await getInterventionById(body.interventionId)
    : typeof body.interventionSlug === "string"
      ? await getInterventionBySlug(body.interventionSlug)
      : undefined;

  if (!intervention) {
    return Response.json({ ok: false, error: "unknown intervention" }, { status: 404 });
  }
  if (!body.context || typeof body.context !== "object") {
    return Response.json({ ok: false, error: "context is required" }, { status: 400 });
  }
  const contextKey = canonicalizeContext(body.context as Context);
  const recommendationIdFromBody: string | undefined =
    typeof body.recommendationId === "string" ? body.recommendationId : undefined;

  if (body.selfReport === true) {
    await recordSelfReport({
      interventionId: intervention.id,
      contextKey,
      success: Boolean(body.success),
      recommendationId: recommendationIdFromBody,
    });
    return Response.json({
      ok: true,
      beliefUpdated: false,
      note: "self-reports are logged for audit but never move effect beliefs",
    });
  }

  if (isValidCommitmentFollowThrough(body)) {
    const row = await recordVerifiedOutcome({
      interventionId: intervention.id,
      contextKey,
      priorEvidenceClass: intervention.evidenceClass,
      source: "commitment_followthrough",
      success: body.completed === true,
      magnitude: typeof body.measuredEffect === "number" ? body.measuredEffect : 1,
      commitmentId: body.commitmentId,
      recommendationId: recommendationIdFromBody,
    });
    return Response.json({ ok: true, beliefUpdated: true, row });
  }

  if (typeof body.experimentId === "string") {
    const row = await recordVerifiedOutcome({
      interventionId: intervention.id,
      contextKey,
      priorEvidenceClass: intervention.evidenceClass,
      source: "experiment_result",
      success: Boolean(body.success),
      magnitude: typeof body.magnitude === "number" ? body.magnitude : 1,
      experimentId: body.experimentId,
      recommendationId: recommendationIdFromBody,
    });
    return Response.json({ ok: true, beliefUpdated: true, row });
  }

  return Response.json(
    { ok: false, error: "payload did not match commitment follow-through, experiment result, or self-report shapes" },
    { status: 400 },
  );
}
