// =============================================================================
// LEADOS kernel — work queue & delegation
// =============================================================================
// proposed -> approved -> running -> verifying -> done | reverted | rejected
// Agents propose tasks (via the findings.create_work_item capability, or
// directly through proposeWorkItem below); humans (or the kernel, for
// auto-tier capabilities) move them through the status machine. SLA timers +
// escalation are enforced by checkSlaBreaches(), called from the
// deadline-approaching-watch scheduled job.

import { db } from "@/db";
import { notifications, workItems } from "@/db/schema";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { recordAudit } from "./audit";

export type WorkItemStatus = "proposed" | "approved" | "running" | "verifying" | "done" | "reverted" | "rejected";

const TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  proposed: ["approved", "rejected"],
  approved: ["running", "rejected"],
  running: ["verifying", "reverted"],
  verifying: ["done", "reverted"],
  done: [],
  reverted: ["proposed"],
  rejected: [],
};

export async function proposeWorkItem(input: {
  title: string;
  description: string;
  domain: string;
  proposedBy: string;
  riskClass?: "low" | "medium" | "high";
  slaHours?: number;
  evidence?: Record<string, unknown>;
}) {
  const slaDueAt = input.slaHours ? new Date(Date.now() + input.slaHours * 3600_000) : null;
  const [row] = await db
    .insert(workItems)
    .values({
      title: input.title,
      description: input.description,
      domain: input.domain,
      proposedBy: input.proposedBy,
      status: "proposed",
      riskClass: input.riskClass ?? "low",
      slaDueAt,
      evidence: input.evidence ?? {},
    })
    .returning();
  await recordAudit({
    actor: input.proposedBy,
    action: "work_item.proposed",
    subjectType: "work_item",
    subjectId: String(row.id),
    reason: input.title,
  });
  return row;
}

export async function transitionWorkItem(
  id: number,
  nextStatus: WorkItemStatus,
  actor: string,
  opts: { assignee?: string; reason?: string } = {},
) {
  const rows = await db.select().from(workItems).where(eq(workItems.id, id)).limit(1);
  const item = rows[0];
  if (!item) throw new Error(`Work item #${id} not found`);

  const allowed = TRANSITIONS[item.status as WorkItemStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(`Cannot transition work item #${id} from "${item.status}" to "${nextStatus}"`);
  }

  const [updated] = await db
    .update(workItems)
    .set({ status: nextStatus, assignee: opts.assignee ?? item.assignee, updatedAt: new Date() })
    .where(eq(workItems.id, id))
    .returning();

  await recordAudit({
    actor,
    action: `work_item.${item.status}_to_${nextStatus}`,
    subjectType: "work_item",
    subjectId: String(id),
    reason: opts.reason ?? `Transitioned by ${actor}`,
    riskClass: item.riskClass as "low" | "medium" | "high",
  });

  return updated;
}

export async function listWorkItems(status?: WorkItemStatus) {
  if (status) return db.select().from(workItems).where(eq(workItems.status, status)).orderBy(desc(workItems.createdAt));
  return db.select().from(workItems).orderBy(desc(workItems.createdAt));
}

/** Scans for work items whose SLA has passed and are not yet terminal,
 * escalates them with a notification, and stamps escalatedAt (once). */
export async function checkSlaBreaches(now: Date = new Date()): Promise<number> {
  const candidates = await db
    .select()
    .from(workItems)
    .where(and(lt(workItems.slaDueAt, now), isNull(workItems.escalatedAt)));

  let escalated = 0;
  for (const item of candidates) {
    if (["done", "reverted", "rejected"].includes(item.status)) continue;
    await db.update(workItems).set({ escalatedAt: now }).where(eq(workItems.id, item.id));
    await db.insert(notifications).values({
      type: "sla_breach",
      title: `SLA breached: ${item.title}`,
      body: `Work item #${item.id} (${item.domain}) missed its SLA while in status "${item.status}".`,
      severity: "critical",
      linkedWorkItemId: item.id,
    });
    await recordAudit({
      actor: "agent:scheduler",
      action: "work_item.sla_escalated",
      subjectType: "work_item",
      subjectId: String(item.id),
      reason: "SLA due date passed",
      riskClass: "medium",
    });
    escalated++;
  }
  return escalated;
}

/** Unified inbox: work items needing attention + unread notifications +
 * pending approvals, newest first. */
export async function getUnifiedInbox() {
  const { approvals } = await import("@/db/schema");
  const [openWork, unreadNotifications, pendingApprovals] = await Promise.all([
    db.select().from(workItems).where(eq(workItems.status, "proposed")).orderBy(desc(workItems.createdAt)).limit(25),
    db.select().from(notifications).where(eq(notifications.read, false)).orderBy(desc(notifications.createdAt)).limit(25),
    db.select().from(approvals).where(eq(approvals.status, "pending")).orderBy(desc(approvals.requestedAt)).limit(25),
  ]);

  const items = [
    ...openWork.map((w) => ({ kind: "work_item" as const, id: w.id, title: w.title, createdAt: w.createdAt, riskClass: w.riskClass })),
    ...unreadNotifications.map((n) => ({ kind: "notification" as const, id: n.id, title: n.title, createdAt: n.createdAt, severity: n.severity })),
    ...pendingApprovals.map((a) => ({ kind: "approval" as const, id: a.id, title: a.summary, createdAt: a.requestedAt, riskClass: a.riskClass })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { items, counts: { workItems: openWork.length, notifications: unreadNotifications.length, approvals: pendingApprovals.length } };
}
