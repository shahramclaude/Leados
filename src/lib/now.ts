// Powers the "/" decision-first cockpit: top decisions needing attention
// right now, a delta summary since the user's last visit (not a wall of
// history), the pending approval queue, and one recommended next action —
// every item carries its evidence.

import { db } from "@/db";
import { approvals, findings, metricAnomalies, tasks, userState } from "@/db/schema";
import { and, desc, eq, gt, gte } from "drizzle-orm";

export interface EvidenceItem {
  id: string;
  title: string;
  domain: string;
  severity: number;
  evidence: string;
  createdAt: string;
}

export interface NowSurface {
  topDecisions: EvidenceItem[];
  pendingApprovals: EvidenceItem[];
  delta: {
    sinceISO: string;
    newFindings: number;
    newApprovals: number;
    newAnomalies: number;
    updatedTasks: number;
    highlights: EvidenceItem[];
  };
  recommendedAction: (EvidenceItem & { why: string }) | null;
}

function toEvidence(row: {
  id: string;
  title: string;
  domain: string;
  severity: number;
  createdAt: Date;
}, evidence: string): EvidenceItem {
  return {
    id: row.id,
    title: row.title,
    domain: row.domain,
    severity: row.severity,
    evidence,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getLastVisit(userId: string): Promise<Date> {
  const rows = await db.select().from(userState).where(eq(userState.userId, userId)).limit(1);
  return rows[0]?.lastVisitAt ?? new Date(0);
}

export async function markVisited(userId: string): Promise<void> {
  const existing = await db.select().from(userState).where(eq(userState.userId, userId)).limit(1);
  if (existing[0]) {
    await db.update(userState).set({ lastVisitAt: new Date(), updatedAt: new Date() }).where(eq(userState.userId, userId));
  } else {
    await db.insert(userState).values({ userId });
  }
}

export async function getNowSurface(userId: string): Promise<NowSurface> {
  const lastVisit = await getLastVisit(userId);

  const [pendingApprovalRows, openFindingRows, recentAnomalies, recentTasks] = await Promise.all([
    db.select().from(approvals).where(eq(approvals.status, "pending")).orderBy(desc(approvals.severity), approvals.createdAt).limit(10),
    db.select().from(findings).where(eq(findings.status, "open")).orderBy(desc(findings.severity), desc(findings.createdAt)).limit(10),
    db.select().from(metricAnomalies).orderBy(desc(metricAnomalies.createdAt)).limit(10),
    db.select().from(tasks).where(eq(tasks.status, "open")).orderBy(desc(tasks.severity), tasks.dueAt).limit(10),
  ]);

  const decisionCandidates: EvidenceItem[] = [
    ...pendingApprovalRows.map((a) => toEvidence(a, `requested by ${a.requestedBy} — ${JSON.stringify(a.evidence).slice(0, 140)}`)),
    ...openFindingRows
      .filter((f) => f.severity >= 4)
      .map((f) => toEvidence(f, f.summary)),
  ]
    .sort((a, b) => b.severity - a.severity || (a.createdAt < b.createdAt ? -1 : 1))
    .slice(0, 3);

  const pendingApprovals = pendingApprovalRows.map((a) => toEvidence(a, `requested by ${a.requestedBy}`));

  const [newFindings, newApprovals, newAnomalies, newTasks] = await Promise.all([
    db.select().from(findings).where(gt(findings.createdAt, lastVisit)),
    db.select().from(approvals).where(gt(approvals.createdAt, lastVisit)),
    db.select().from(metricAnomalies).where(gte(metricAnomalies.createdAt, lastVisit)),
    db.select().from(tasks).where(gt(tasks.updatedAt, lastVisit)),
  ]);

  const highlights: EvidenceItem[] = [
    ...newFindings.map((f) => toEvidence(f, f.summary)),
    ...newApprovals.map((a) => toEvidence(a, `pending approval requested by ${a.requestedBy}`)),
    ...newAnomalies.map((a) => toEvidence({ ...a, title: `${a.metric} anomaly` }, a.description)),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 5);

  let recommendedAction: NowSurface["recommendedAction"] = null;
  const topApproval = pendingApprovalRows[0];
  const topFinding = openFindingRows[0];
  if (topApproval && (!topFinding || topApproval.severity >= topFinding.severity)) {
    recommendedAction = {
      ...toEvidence(topApproval, `requested by ${topApproval.requestedBy}`),
      why: `highest-severity pending approval (${topApproval.severity}/5), waiting since ${topApproval.createdAt.toISOString()}`,
    };
  } else if (topFinding) {
    recommendedAction = {
      ...toEvidence(topFinding, topFinding.summary),
      why: `highest-severity open finding (${topFinding.severity}/5) with no action yet`,
    };
  }

  void recentAnomalies;
  void recentTasks;

  return {
    topDecisions: decisionCandidates,
    pendingApprovals,
    delta: {
      sinceISO: lastVisit.toISOString(),
      newFindings: newFindings.length,
      newApprovals: newApprovals.length,
      newAnomalies: newAnomalies.length,
      updatedTasks: newTasks.length,
      highlights,
    },
    recommendedAction,
  };
}
