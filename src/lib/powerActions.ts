// Part 10 compatibility: T4 (highest power tier) action catalogue, extended
// here with the dual-control (two-person rule) engine that Part 46 requires.
// "T4" actions are ones that concentrate power enough that a single actor
// must never be able to execute them alone.

export const T4_ACTIONS = [
  "bulk_people_data_export",
  "evaluation_policy_change",
  "mass_notification_all_staff",
  "org_wide_policy_publish",
  "dissent_suggestion_archive",
] as const;

export type T4ActionType = (typeof T4_ACTIONS)[number];

export function isT4Action(actionType: string): actionType is T4ActionType {
  return (T4_ACTIONS as readonly string[]).includes(actionType);
}

import { db } from "@/db";
import { dualControlActions, dualControlApprovals, dualControlViolationAttempts, orgSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";

const DEFAULT_APPROVERS_REQUIRED = 1; // additional distinct approvers beyond the requester => 2 people total

export async function getApproversRequired(orgId = "default"): Promise<number> {
  const [row] = await db
    .select()
    .from(orgSettings)
    .where(and(eq(orgSettings.orgId, orgId), eq(orgSettings.key, "dual_control.approvers_required")));
  if (row && typeof row.value === "number") return row.value;
  return DEFAULT_APPROVERS_REQUIRED;
}

export async function requestAction(params: {
  actionType: string;
  orgId?: string;
  payload: Record<string, unknown>;
  requestedByPersonId: number;
  requestedByRole: string;
}) {
  if (!isT4Action(params.actionType)) {
    throw new Error(`"${params.actionType}" is not a recognized T4 power action`);
  }
  const [row] = await db
    .insert(dualControlActions)
    .values({
      actionType: params.actionType,
      orgId: params.orgId ?? "default",
      payload: params.payload,
      requestedByPersonId: params.requestedByPersonId,
      status: "pending",
    })
    .returning();

  await recordAudit({
    actorId: params.requestedByPersonId,
    actorRole: params.requestedByRole,
    action: "dual_control.requested",
    resourceType: "dual_control_action",
    resourceId: row.id,
    metadata: { actionType: params.actionType },
  });

  return row;
}

export interface ApproveResult {
  status: "pending" | "approved" | "executed" | "blocked";
  action: typeof dualControlActions.$inferSelect | null;
  distinctApprovers: number;
  message: string;
}

export async function approveAction(params: {
  actionId: number;
  approverPersonId: number;
  approverRole: string;
}): Promise<ApproveResult> {
  const [action] = await db.select().from(dualControlActions).where(eq(dualControlActions.id, params.actionId));
  if (!action) throw new Error("Action not found");

  // THE core power-check: the requester can never approve their own request.
  // This is the single-actor attempt that must always be blocked.
  if (action.requestedByPersonId === params.approverPersonId) {
    await db.insert(dualControlViolationAttempts).values({
      actionId: action.id,
      attemptedByPersonId: params.approverPersonId,
      reason: "Requester attempted to self-approve a T4 action (single-actor attempt).",
    });
    await recordAudit({
      actorId: params.approverPersonId,
      actorRole: params.approverRole,
      action: "dual_control.violation_attempt",
      resourceType: "dual_control_action",
      resourceId: action.id,
      metadata: { actionType: action.actionType },
    });
    return {
      status: "blocked",
      action,
      distinctApprovers: 0,
      message:
        "Blocked: the requester cannot also be the approver. This action requires a " +
        "second, distinct person under the two-person rule.",
    };
  }

  if (action.status !== "pending") {
    return {
      status: action.status as ApproveResult["status"],
      action,
      distinctApprovers: 0,
      message: `Action is already ${action.status}; no further approvals accepted.`,
    };
  }

  await db
    .insert(dualControlApprovals)
    .values({ actionId: action.id, approverPersonId: params.approverPersonId, decision: "approve" })
    .onConflictDoNothing();

  const approvals = await db.select().from(dualControlApprovals).where(eq(dualControlApprovals.actionId, action.id));
  const distinctApprovers = new Set(approvals.map((a) => a.approverPersonId)).size;
  const required = await getApproversRequired(action.orgId);

  await recordAudit({
    actorId: params.approverPersonId,
    actorRole: params.approverRole,
    action: "dual_control.approved",
    resourceType: "dual_control_action",
    resourceId: action.id,
    metadata: { distinctApprovers, required },
  });

  if (distinctApprovers >= required) {
    const [executed] = await db
      .update(dualControlActions)
      .set({ status: "executed", executedAt: new Date() })
      .where(eq(dualControlActions.id, action.id))
      .returning();
    await recordAudit({
      actorId: params.approverPersonId,
      actorRole: params.approverRole,
      action: "dual_control.executed",
      resourceType: "dual_control_action",
      resourceId: action.id,
      metadata: { actionType: action.actionType },
    });
    return {
      status: "executed",
      action: executed,
      distinctApprovers,
      message: `Executed: ${distinctApprovers} distinct approver(s) met the required threshold of ${required}.`,
    };
  }

  return {
    status: "pending",
    action,
    distinctApprovers,
    message: `Recorded approval. ${distinctApprovers}/${required} distinct approvers so far.`,
  };
}
