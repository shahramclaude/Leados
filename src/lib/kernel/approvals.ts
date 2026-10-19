// =============================================================================
// LEADOS kernel — approvals (human-in-the-loop gate)
// =============================================================================
// Every risk-class >= medium capability invocation is routed through here
// instead of being executed directly. Approving calls the SAME
// executeToolCall() code path the kernel's own auto-mode actions use, so
// there is exactly one place capability.execute() is ever invoked from.

import { db } from "@/db";
import { approvals, kernelToolCalls } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { executeToolCall } from "./orchestrator";
import { recordAudit } from "./audit";

export async function listPendingApprovals() {
  return db.select().from(approvals).where(eq(approvals.status, "pending")).orderBy(desc(approvals.requestedAt));
}

export async function listApprovals(limit = 50) {
  return db.select().from(approvals).orderBy(desc(approvals.requestedAt)).limit(limit);
}

export async function decideApproval(
  approvalId: number,
  decision: "approved" | "rejected",
  decidedBy: string,
  reason?: string,
): Promise<{ approval: typeof approvals.$inferSelect; toolCallStatus: string }> {
  const rows = await db.select().from(approvals).where(eq(approvals.id, approvalId)).limit(1);
  const approval = rows[0];
  if (!approval) throw new Error(`Approval #${approvalId} not found`);
  if (approval.status !== "pending") throw new Error(`Approval #${approvalId} already ${approval.status}`);

  const [updated] = await db
    .update(approvals)
    .set({ status: decision, decidedBy, decidedAt: new Date(), reason: reason ?? null })
    .where(eq(approvals.id, approvalId))
    .returning();

  if (decision === "rejected") {
    await db.update(kernelToolCalls).set({ status: "rejected" }).where(eq(kernelToolCalls.id, approval.toolCallId));
    await recordAudit({
      actor: `human:${decidedBy}`,
      action: "approval.rejected",
      subjectType: "approval",
      subjectId: String(approvalId),
      reason: reason ?? "No reason given",
      riskClass: approval.riskClass as "low" | "medium" | "high",
    });
    return { approval: updated, toolCallStatus: "rejected" };
  }

  await db.update(kernelToolCalls).set({ status: "approved" }).where(eq(kernelToolCalls.id, approval.toolCallId));
  await recordAudit({
    actor: `human:${decidedBy}`,
    action: "approval.approved",
    subjectType: "approval",
    subjectId: String(approvalId),
    reason: reason ?? "Approved",
    riskClass: approval.riskClass as "low" | "medium" | "high",
  });

  await executeToolCall(approval.toolCallId, `human:${decidedBy}`);

  const toolCallRows = await db.select().from(kernelToolCalls).where(eq(kernelToolCalls.id, approval.toolCallId)).limit(1);
  return { approval: updated, toolCallStatus: toolCallRows[0]?.status ?? "unknown" };
}
