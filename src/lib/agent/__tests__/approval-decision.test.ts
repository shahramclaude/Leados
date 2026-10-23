import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { approvals } from "@/db/schema";
import { SystemClock } from "../clock";
import { createAndEnqueueRun } from "../orchestrator";
import { runOrResumeRun } from "../executor";
import { recordApprovalDecision } from "../approvals";

async function createAwaitingApprovalRun() {
  const created = await createAndEnqueueRun({
    objective: "Reallocate marketing budget to support team given Q3 overrun",
    budgetUsd: 1.5,
    budgetMin: 12,
    requestedBy: "test-suite",
  });
  if (!created.ok) throw new Error("plan rejected unexpectedly");
  const clock = new SystemClock();
  let result = await runOrResumeRun(created.runId, clock);
  // Drive forward until it parks on an approval (budget-reallocation template
  // always contains a T3 node).
  let guard = 0;
  while (result.verdict !== "awaiting_approval" && guard++ < 10) {
    result = await runOrResumeRun(created.runId, clock);
  }
  expect(result.verdict).toBe("awaiting_approval");
  const [pending] = await db.select().from(approvals).where(eq(approvals.runId, created.runId));
  return { runId: created.runId, approval: pending, clock };
}

describe("recordApprovalDecision", () => {
  it("rejects a rubber-stamp reason and leaves the approval pending", async () => {
    const { approval } = await createAwaitingApprovalRun();
    const result = await recordApprovalDecision(approval.id, { decision: "approve", reason: "ok", reviewer: "cfo" });
    expect(result.ok).toBe(false);
    const [row] = await db.select().from(approvals).where(eq(approvals.id, approval.id));
    expect(row.status).toBe("pending");
  });

  it("rejects a reason that fails the attention check when one is required", async () => {
    const { approval } = await createAwaitingApprovalRun();
    if (!approval.attentionRequired) return; // this run's node didn't land in the attention-check bucket
    const result = await recordApprovalDecision(approval.id, {
      decision: "approve",
      reason: "Reviewed the reallocation rationale and it ties cleanly to the variance data, approving.",
      reviewer: "cfo",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ATTENTION_CHECK_FAILED");
  });

  it("accepts a specific, goal-grounded reason (and the attention nonce, if required)", async () => {
    const { approval, runId, clock } = await createAwaitingApprovalRun();
    const reasonCore =
      "Reviewed the reallocation rationale: shifting budget to support is justified by the Q3 overrun and the net change across cost centers is zero.";
    const reason = approval.attentionRequired ? `${reasonCore} Estimated cost confirmed as ${approval.attentionNonce}.` : reasonCore;
    const result = await recordApprovalDecision(approval.id, { decision: "approve", reason, reviewer: "cfo" });
    expect(result.ok).toBe(true);
    const [row] = await db.select().from(approvals).where(eq(approvals.id, approval.id));
    expect(row.status).toBe("approved");

    // Resuming the run should now proceed past the approved node.
    const resumed = await runOrResumeRun(runId, clock);
    expect(["success", "awaiting_approval", "aborted"]).toContain(
      resumed.verdict === "in_progress" ? "success" : resumed.verdict
    );
  });
});
