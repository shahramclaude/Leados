// LEADOS Part 14 — "Now" surface ranking.
// Unifies approvals (Part 10 stand-in) and findings (Part 03 stand-in) into
// one ranked decision queue: score = severity x urgency, role-scoped.
import { db } from "@/db";
import { approvals, findings, users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";

export interface DecisionItem {
  id: string;
  type: "approval" | "finding";
  title: string;
  detail: string;
  severity: number;
  urgency: number;
  score: number;
  entityRef: string | null;
  createdAt: string;
  evidence: string[];
}

function urgencyFromDue(dueAt: Date | null, now: Date): number {
  if (!dueAt) return 0.4;
  const hoursLeft = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursLeft <= 0) return 1;
  if (hoursLeft < 24) return 0.9;
  if (hoursLeft < 72) return 0.6;
  return 0.3;
}

function urgencyFromAge(createdAt: Date, now: Date): number {
  const hoursOld = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
  // fresh findings are more urgent (recency = attention-worthy), decays over 72h
  return Math.max(0.2, 1 - hoursOld / 72);
}

export async function getDecisionQueue(orgId: string, role: string, now: Date = new Date()): Promise<DecisionItem[]> {
  const pendingApprovals = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.orgId, orgId), eq(approvals.assigneeRole, role), eq(approvals.status, "pending")));

  const recentFindings = await db
    .select()
    .from(findings)
    .where(and(eq(findings.orgId, orgId), eq(findings.visibleToRole, role)));

  const items: DecisionItem[] = [];

  for (const a of pendingApprovals) {
    const urgency = urgencyFromDue(a.dueAt, now);
    items.push({
      id: a.id,
      type: "approval",
      title: a.title,
      detail: a.description,
      severity: a.severity,
      urgency,
      score: a.severity * urgency,
      entityRef: a.entityRef,
      createdAt: a.createdAt.toISOString(),
      evidence: [
        `severity ${a.severity}/5`,
        a.dueAt ? `due ${a.dueAt.toISOString()}` : "no explicit due date",
        `status: ${a.status}`,
      ],
    });
  }

  for (const f of recentFindings) {
    const urgency = urgencyFromAge(f.createdAt, now);
    items.push({
      id: f.id,
      type: "finding",
      title: f.title,
      detail: f.detail,
      severity: f.severity,
      urgency,
      score: f.severity * urgency,
      entityRef: f.entityRef,
      createdAt: f.createdAt.toISOString(),
      evidence: [`severity ${f.severity}/5`, `surfaced ${f.createdAt.toISOString()}`],
    });
  }

  items.sort((a, b) => b.score - a.score);
  return items;
}

export interface DeltaStrip {
  sinceISO: string | null;
  newFindings: number;
  newApprovals: number;
  items: DecisionItem[];
}

export async function getDeltaSinceLastVisit(orgId: string, role: string, lastSeenAt: Date | null, now: Date = new Date()): Promise<DeltaStrip> {
  if (!lastSeenAt) {
    return { sinceISO: null, newFindings: 0, newApprovals: 0, items: [] };
  }
  const newFindingsRows = await db
    .select()
    .from(findings)
    .where(and(eq(findings.orgId, orgId), eq(findings.visibleToRole, role), gt(findings.createdAt, lastSeenAt)));
  const newApprovalsRows = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.orgId, orgId), eq(approvals.assigneeRole, role), gt(approvals.createdAt, lastSeenAt)));

  const items: DecisionItem[] = [
    ...newApprovalsRows.map((a) => ({
      id: a.id,
      type: "approval" as const,
      title: a.title,
      detail: a.description,
      severity: a.severity,
      urgency: urgencyFromDue(a.dueAt, now),
      score: a.severity,
      entityRef: a.entityRef,
      createdAt: a.createdAt.toISOString(),
      evidence: [`new since your last visit`],
    })),
    ...newFindingsRows.map((f) => ({
      id: f.id,
      type: "finding" as const,
      title: f.title,
      detail: f.detail,
      severity: f.severity,
      urgency: urgencyFromAge(f.createdAt, now),
      score: f.severity,
      entityRef: f.entityRef,
      createdAt: f.createdAt.toISOString(),
      evidence: [`new since your last visit`],
    })),
  ];

  return {
    sinceISO: lastSeenAt.toISOString(),
    newFindings: newFindingsRows.length,
    newApprovals: newApprovalsRows.length,
    items,
  };
}

export async function markNowVisited(userId: string, at: Date = new Date()): Promise<Date | null> {
  const [row] = await db.select({ lastSeenNowAt: users.lastSeenNowAt }).from(users).where(eq(users.id, userId)).limit(1);
  await db.update(users).set({ lastSeenNowAt: at }).where(eq(users.id, userId));
  return row?.lastSeenNowAt ?? null;
}

export function recommendNextAction(items: DecisionItem[]): DecisionItem | null {
  return items[0] ?? null;
}
