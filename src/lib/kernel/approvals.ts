// Human-in-the-loop approval queue, designed: rich context (proposed action,
// predicted diff, evidence, risk class), one-click approve/reject/modify,
// and an immutable record (every decision is also an event).
import { db } from "@/db";
import { kernelApprovals, kernelSteps } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { newId } from "./ids";
import { appendEvent } from "./events";
import type { Actor, PredictedDiff, RiskClass } from "./types";

export type ApprovalRow = typeof kernelApprovals.$inferSelect;

export async function createApprovalRequest(params: {
  stepId: string;
  runId: string;
  riskClass: RiskClass;
  predictedDiff: PredictedDiff;
  evidence: unknown;
}): Promise<ApprovalRow> {
  const id = newId("appr");
  const [row] = await db
    .insert(kernelApprovals)
    .values({
      id,
      stepId: params.stepId,
      runId: params.runId,
      riskClass: params.riskClass,
      predictedDiff: params.predictedDiff,
      evidence: params.evidence as object,
    })
    .returning();

  await appendEvent({
    type: "approval.requested",
    actor: { kind: "system", id: "kernel" },
    correlationId: params.runId,
    causationId: params.stepId,
    payload: row,
    notify: { topic: "approvals" },
  });

  return row;
}

export async function listPendingApprovals(): Promise<ApprovalRow[]> {
  return db.select().from(kernelApprovals).where(eq(kernelApprovals.status, "pending")).orderBy(desc(kernelApprovals.requestedAt));
}

export async function getApproval(id: string): Promise<ApprovalRow | undefined> {
  const [row] = await db.select().from(kernelApprovals).where(eq(kernelApprovals.id, id)).limit(1);
  return row;
}

export async function decideApproval(params: {
  approvalId: string;
  decision: "approved" | "rejected" | "modified";
  decidedBy: Actor;
  note?: string;
  modifiedInput?: unknown;
}): Promise<ApprovalRow> {
  const [row] = await db
    .update(kernelApprovals)
    .set({
      status: params.decision,
      decidedAt: new Date(),
      decidedBy: params.decidedBy.id,
      decisionNote: params.note ?? null,
      modifiedInput: (params.modifiedInput as object) ?? null,
    })
    .where(eq(kernelApprovals.id, params.approvalId))
    .returning();

  await appendEvent({
    type: "approval.decided",
    actor: params.decidedBy,
    correlationId: row.runId,
    causationId: row.stepId,
    payload: { approvalId: row.id, decision: params.decision, note: params.note ?? null },
  });

  if (params.decision === "modified" && params.modifiedInput !== undefined) {
    await db.update(kernelSteps).set({ input: params.modifiedInput as object }).where(eq(kernelSteps.id, row.stepId));
  }

  return row;
}
