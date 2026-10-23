// LEADOS Agent Kernel — approval decision recording.
// Shared by the HTTP route (src/app/api/agent/approvals/[id]/route.ts) and
// the eval harness / tests, so there is exactly one implementation of the
// attention-check + reason-quality gate described in PHASE 5.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { approvals, planNodes } from "@/db/schema";
import { attentionCheckPassed, MIN_REASON_QUALITY, scoreReasonQuality } from "./approval-quality";

export interface ApprovalDecisionInput {
  decision: "approve" | "reject";
  reason: string;
  reviewer: string;
}

export type ApprovalDecisionResult =
  | { ok: true; qualityScore: number }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_RESOLVED" | "ATTENTION_CHECK_FAILED" | "REASON_QUALITY_TOO_LOW"; message: string; qualityScore?: number };

export async function recordApprovalDecision(
  approvalId: number,
  input: ApprovalDecisionInput
): Promise<ApprovalDecisionResult> {
  const [approval] = await db.select().from(approvals).where(eq(approvals.id, approvalId));
  if (!approval) return { ok: false, code: "NOT_FOUND", message: "approval not found" };
  if (approval.status !== "pending") {
    return { ok: false, code: "ALREADY_RESOLVED", message: `approval already resolved as ${approval.status}` };
  }

  const nodesForRun = await db.select().from(planNodes).where(eq(planNodes.runId, approval.runId));
  const matchingNode = nodesForRun.find((n) => n.nodeId === approval.nodeId);
  const goal = matchingNode?.goal ?? "";

  const qualityScore = scoreReasonQuality(input.reason, goal);
  const attentionOk = attentionCheckPassed(input.reason, approval.attentionNonce);

  if (!attentionOk) {
    await db.update(approvals).set({ reasonQualityScore: qualityScore.toFixed(2) }).where(eq(approvals.id, approvalId));
    return {
      ok: false,
      code: "ATTENTION_CHECK_FAILED",
      message:
        "this approval requires you to state the node's exact estimated cost (visible on the node detail) in your reason before it can be recorded",
      qualityScore,
    };
  }

  if (qualityScore < MIN_REASON_QUALITY) {
    await db.update(approvals).set({ reasonQualityScore: qualityScore.toFixed(2) }).where(eq(approvals.id, approvalId));
    return {
      ok: false,
      code: "REASON_QUALITY_TOO_LOW",
      message: `score ${qualityScore}/5 is below the minimum of ${MIN_REASON_QUALITY}`,
      qualityScore,
    };
  }

  await db
    .update(approvals)
    .set({
      status: input.decision === "approve" ? "approved" : "rejected",
      reason: input.reason,
      reviewer: input.reviewer,
      reasonQualityScore: qualityScore.toFixed(2),
      reviewedAt: new Date(),
    })
    .where(eq(approvals.id, approvalId));

  return { ok: true, qualityScore };
}
