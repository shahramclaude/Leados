import { db } from "@/db";
import { approvals, auditLog, findings, objectives, scenarios } from "@/db/schema";
import { and, desc, eq, gt, ilike, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Server-side data access for server components. Every route that needs more
// than one independent read uses Promise.all here instead of sequential
// awaits — see PART-03-REPORT.md Phase 0/4 for the measured before/after.
// ---------------------------------------------------------------------------

export async function getScenarios() {
  return db.select().from(scenarios).orderBy(desc(scenarios.createdAt));
}

export interface ObjectivesFilter {
  status?: string;
  scenarioId?: string;
  q?: string;
  sort?: "updated" | "created" | "title";
}

export async function getObjectives(filter: ObjectivesFilter) {
  const conditions = [];
  if (filter.status) conditions.push(eq(objectives.status, filter.status));
  if (filter.scenarioId) conditions.push(eq(objectives.scenarioId, filter.scenarioId));
  if (filter.q) conditions.push(ilike(objectives.title, `%${filter.q}%`));

  const orderBy =
    filter.sort === "created"
      ? desc(objectives.createdAt)
      : filter.sort === "title"
        ? objectives.title
        : desc(objectives.updatedAt);

  return db
    .select()
    .from(objectives)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(orderBy);
}

/** Single objective + its findings + its approval, fetched in parallel. */
export async function getObjectiveDetail(id: string) {
  const [objectiveRows, findingRows, approvalRows] = await Promise.all([
    db.select().from(objectives).where(eq(objectives.id, id)),
    db.select().from(findings).where(eq(findings.objectiveId, id)).orderBy(desc(findings.createdAt)),
    db.select().from(approvals).where(eq(approvals.objectiveId, id)).orderBy(desc(approvals.createdAt)),
  ]);
  return {
    objective: objectiveRows[0] ?? null,
    findings: findingRows,
    approvals: approvalRows,
  };
}

export async function getApprovals(filter: { status?: string }) {
  const rows = await db
    .select({
      approval: approvals,
      objectiveTitle: objectives.title,
    })
    .from(approvals)
    .innerJoin(objectives, eq(approvals.objectiveId, objectives.id))
    .where(filter.status ? eq(approvals.status, filter.status) : undefined)
    .orderBy(desc(approvals.createdAt));
  return rows;
}

export async function getAuditSince(since?: string, limit = 50) {
  return db
    .select()
    .from(auditLog)
    .where(since ? gt(auditLog.createdAt, new Date(since)) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/** Dashboard aggregates, fetched in parallel (4 independent queries → 1 round trip each, run concurrently). */
export async function getDashboardSummary() {
  const [objectiveCounts, pendingApprovals, recentFindings, recentAudit] = await Promise.all([
    db
      .select({ status: objectives.status, count: sql<number>`count(*)::int` })
      .from(objectives)
      .groupBy(objectives.status),
    db.select({ count: sql<number>`count(*)::int` }).from(approvals).where(eq(approvals.status, "pending")),
    db.select().from(findings).orderBy(desc(findings.createdAt)).limit(5),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(8),
  ]);

  return { objectiveCounts, pendingApprovals: pendingApprovals[0]?.count ?? 0, recentFindings, recentAudit };
}

/**
 * Deliberately sequential twin of getDashboardSummary used ONLY by the
 * Phase 0/4 benchmark harness (scripts/measure-waterfalls.mjs) to produce a
 * real, measured "before" number for the fetch-waterfall comparison. Not
 * used by any page.
 */
export async function getDashboardSummarySequential() {
  const objectiveCounts = await db
    .select({ status: objectives.status, count: sql<number>`count(*)::int` })
    .from(objectives)
    .groupBy(objectives.status);
  const pendingApprovals = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(approvals)
    .where(eq(approvals.status, "pending"));
  const recentFindings = await db.select().from(findings).orderBy(desc(findings.createdAt)).limit(5);
  const recentAudit = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(8);

  return { objectiveCounts, pendingApprovals: pendingApprovals[0]?.count ?? 0, recentFindings, recentAudit };
}
