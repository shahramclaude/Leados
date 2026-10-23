import { db } from "@/db";
import { actionPolicies, approvals, auditEvents } from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { newId } from "@/lib/id";
import { appendAuditEvent } from "@/lib/auditLog";

/* ============================================================================
 * PART 67 — Automation ladder & governed autonomy (T0–T5).
 *
 * The Action Gate is the single chokepoint every side-effecting call must
 * pass through. It enforces: tier policy, a rolling 24h token-bucket budget
 * (never a midnight reset — that is a documented, tested anti-gaming fix),
 * and approval routing with a value-of-information-adjusted SLA.
 * ========================================================================== */

export type Tier = "T0" | "T1" | "T2" | "T3" | "T4" | "T5";

export interface GateDecision {
  outcome: "executed" | "queued-for-approval" | "denied";
  reason: string;
  approvalId?: string;
}

/** Rolling 24h usage — sums audit events for this actionKey in the last 24h window. */
async function rollingUsage(actionKey: string): Promise<{ count: number; usd: number }> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.action, actionKey), gte(auditEvents.at, since)));
  let usd = 0;
  for (const r of rows) {
    const payload = r.payload as { costUsd?: number } | null;
    usd += payload?.costUsd ?? 0;
  }
  return { count: rows.length, usd };
}

export async function runActionGate(params: {
  actionKey: string;
  actorId: string;
  costUsd: number;
  blastRadius: number;
  preview: Record<string, unknown>;
  voi?: number;
}): Promise<GateDecision> {
  const [policy] = await db.select().from(actionPolicies).where(eq(actionPolicies.actionKey, params.actionKey));
  if (!policy) {
    return { outcome: "denied", reason: "NO_POLICY: action has no registered ActionPolicy — chokepoint denies by default" };
  }
  if (policy.killSwitchOn) {
    return { outcome: "denied", reason: "KILL_SWITCH_ENGAGED" };
  }

  const usage = await rollingUsage(params.actionKey);
  if (policy.budgetCountPerDay > 0 && usage.count >= policy.budgetCountPerDay) {
    return { outcome: "denied", reason: `BUDGET_EXCEEDED: ${usage.count}/${policy.budgetCountPerDay} actions in rolling 24h window` };
  }
  if (policy.budgetUsdPerDay > 0 && usage.usd + params.costUsd > policy.budgetUsdPerDay) {
    return { outcome: "denied", reason: `BUDGET_EXCEEDED: $${(usage.usd + params.costUsd).toFixed(2)} > $${policy.budgetUsdPerDay} rolling 24h cap` };
  }

  if (policy.approvalMode !== "none") {
    const voi = params.voi ?? 0.2;
    const sla = voi > 0.6 ? Math.min(policy.slaHours, 2) : policy.slaHours;
    const approvalId = newId("appr");
    await db.insert(approvals).values({
      id: approvalId,
      actionKey: params.actionKey,
      tier: policy.tier,
      preview: params.preview,
      voi,
      status: "pending",
      expiresAt: new Date(Date.now() + sla * 3600 * 1000),
    });
    await appendAuditEvent({
      actorKind: "agent",
      actorId: params.actorId,
      action: params.actionKey,
      target: approvalId,
      payload: { stage: "queued-for-approval", costUsd: params.costUsd, blastRadius: params.blastRadius },
    });
    return { outcome: "queued-for-approval", reason: `Tier ${policy.tier} requires ${policy.approvalMode} approval`, approvalId };
  }

  await appendAuditEvent({
    actorKind: "agent",
    actorId: params.actorId,
    action: params.actionKey,
    target: params.actionKey,
    payload: { stage: "executed", costUsd: params.costUsd, blastRadius: params.blastRadius },
  });
  return { outcome: "executed", reason: `Tier ${policy.tier} executes without approval within budget` };
}

export async function decideApproval(approvalId: string, decision: "approve" | "reject", decidedBy: string, reason: string) {
  const [approval] = await db.select().from(approvals).where(eq(approvals.id, approvalId));
  if (!approval) throw new Error("approval not found");
  if (approval.status !== "pending") throw new Error("approval already decided or expired");

  await db
    .update(approvals)
    .set({ status: decision === "approve" ? "approved" : "rejected", decidedAt: new Date(), decidedBy, reason })
    .where(eq(approvals.id, approvalId));

  await appendAuditEvent({
    actorKind: "user",
    actorId: decidedBy,
    action: approval.actionKey,
    target: approvalId,
    payload: { stage: decision, reason },
  });
}

export async function expireStaleApprovals(): Promise<number> {
  const pending = await db.select().from(approvals).where(eq(approvals.status, "pending"));
  let expired = 0;
  for (const a of pending) {
    if (new Date(a.expiresAt) < new Date()) {
      await db.update(approvals).set({ status: "expired" }).where(eq(approvals.id, a.id));
      expired++;
    }
  }
  return expired;
}

export async function triggerKillSwitch(actionKey: string, on: boolean, actorId: string) {
  await db.update(actionPolicies).set({ killSwitchOn: on }).where(eq(actionPolicies.actionKey, actionKey));
  await appendAuditEvent({
    actorKind: "user",
    actorId,
    action: "kill-switch",
    target: actionKey,
    payload: { on },
  });
}
