// Work queue: the task system agents and humans share.
// Status machine: proposed -> approved -> running -> verifying -> done | reverted | dead-lettered
import { db } from "@/db";
import { kernelApprovals, kernelWorkItems } from "@/db/schema";
import { and, desc, eq, lt } from "drizzle-orm";
import { newId } from "./ids";
import { appendEvent } from "./events";
import type { Actor } from "./types";

export type WorkItemRow = typeof kernelWorkItems.$inferSelect;
export type WorkItemStatus = WorkItemRow["status"];

const VALID_TRANSITIONS: Record<string, string[]> = {
  proposed: ["approved", "running", "reverted"],
  approved: ["running", "reverted"],
  running: ["verifying", "done", "failed", "dead-lettered"],
  verifying: ["done", "reverted", "dead-lettered"],
  done: [],
  reverted: ["proposed"],
  "dead-lettered": ["proposed"],
  failed: ["proposed", "dead-lettered"],
};

export class InvalidWorkItemTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot transition work item from "${from}" to "${to}".`);
    this.name = "InvalidWorkItemTransitionError";
  }
}

export async function createWorkItem(params: {
  title: string;
  kind: string;
  assigneeKind?: "human" | "agent";
  assigneeId?: string;
  runId?: string;
  stepId?: string;
  slaMs?: number;
}): Promise<WorkItemRow> {
  const id = newId("wi");
  const [row] = await db
    .insert(kernelWorkItems)
    .values({
      id,
      title: params.title,
      kind: params.kind,
      assigneeKind: params.assigneeKind ?? null,
      assigneeId: params.assigneeId ?? null,
      runId: params.runId ?? null,
      stepId: params.stepId ?? null,
      slaDueAt: params.slaMs ? new Date(Date.now() + params.slaMs) : null,
    })
    .returning();

  await appendEvent({
    type: "work_item.created",
    actor: { kind: "system", id: "kernel" },
    correlationId: params.runId ?? id,
    payload: row,
    notify: { topic: "work_queue" },
  });

  return row;
}

export async function transitionWorkItem(id: string, to: WorkItemStatus, actor: Actor): Promise<WorkItemRow> {
  const [row] = await db.select().from(kernelWorkItems).where(eq(kernelWorkItems.id, id)).limit(1);
  if (!row) throw new Error(`Work item ${id} not found`);
  const allowed = VALID_TRANSITIONS[row.status] ?? [];
  if (!allowed.includes(to)) throw new InvalidWorkItemTransitionError(row.status, to);

  const [updated] = await db
    .update(kernelWorkItems)
    .set({ status: to, updatedAt: new Date() })
    .where(eq(kernelWorkItems.id, id))
    .returning();

  await appendEvent({
    type: "work_item.transitioned",
    actor,
    correlationId: row.runId ?? id,
    causationId: id,
    payload: { workItemId: id, from: row.status, to },
  });

  return updated;
}

export async function assignWorkItem(id: string, assigneeKind: "human" | "agent", assigneeId: string, actor: Actor): Promise<WorkItemRow> {
  const [updated] = await db
    .update(kernelWorkItems)
    .set({ assigneeKind, assigneeId, updatedAt: new Date() })
    .where(eq(kernelWorkItems.id, id))
    .returning();
  await appendEvent({
    type: "work_item.assigned",
    actor,
    correlationId: updated.runId ?? id,
    causationId: id,
    payload: { workItemId: id, assigneeKind, assigneeId },
  });
  return updated;
}

export async function listWorkItems(): Promise<WorkItemRow[]> {
  return db.select().from(kernelWorkItems).orderBy(desc(kernelWorkItems.createdAt));
}

/** SLA timers with escalation: finds work items past their SLA that are not
 * yet escalated, marks them escalated, and returns them (callers notify). */
export async function checkSlaBreaches(): Promise<WorkItemRow[]> {
  const now = new Date();
  const breaches = await db
    .select()
    .from(kernelWorkItems)
    .where(and(lt(kernelWorkItems.slaDueAt, now), eq(kernelWorkItems.escalated, false)));

  const escalated: WorkItemRow[] = [];
  for (const item of breaches) {
    if (item.status === "done" || item.status === "reverted") continue;
    const [updated] = await db
      .update(kernelWorkItems)
      .set({ escalated: true, updatedAt: new Date() })
      .where(eq(kernelWorkItems.id, item.id))
      .returning();
    await appendEvent({
      type: "work_item.sla_breached",
      actor: { kind: "system", id: "scheduler" },
      correlationId: item.runId ?? item.id,
      causationId: item.id,
      payload: { workItemId: item.id, slaDueAt: item.slaDueAt },
      notify: { topic: "notifications" },
    });
    escalated.push(updated);
  }
  return escalated;
}

/** Unified inbox: work queue + approvals + notifications seam for Part 12.
 * Returns a single, sorted feed so a human doesn't have to check three UIs. */
export async function getInbox() {
  const [workItems, approvals] = await Promise.all([
    db.select().from(kernelWorkItems).orderBy(desc(kernelWorkItems.updatedAt)).limit(50),
    db.select().from(kernelApprovals).where(eq(kernelApprovals.status, "pending")).orderBy(desc(kernelApprovals.requestedAt)).limit(50),
  ]);

  const items = [
    ...workItems.map((w) => ({ type: "work_item" as const, id: w.id, title: w.title, status: w.status, updatedAt: w.updatedAt })),
    ...approvals.map((a) => ({ type: "approval" as const, id: a.id, title: `Approval needed: ${a.riskClass} risk step`, status: a.status, updatedAt: a.requestedAt })),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return items;
}
