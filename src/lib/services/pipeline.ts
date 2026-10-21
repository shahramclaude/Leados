import { eq, and, desc, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { approvals, automationRuns, decisions, findings, leads } from "@/db/schema";
import {
  betaMean,
  betaUpdate,
  createBetaPrior,
  createHysteresisConfig,
  hysteresisStep,
  runMonteCarlo,
} from "@/lib/domain";
import { fnv1a } from "@/lib/hash";

const HYSTERESIS = createHysteresisConfig(0.6, 0.4);

export async function createLead(
  db: Database,
  tenantId: string,
  input: { name: string; source: string; notes?: string },
) {
  const [row] = await db
    .insert(leads)
    .values({ tenantId, name: input.name, source: input.source, notes: input.notes ?? "" })
    .returning();
  return row;
}

export async function listLeads(db: Database, tenantId: string, page: number, pageSize: number) {
  const rows = await db
    .select()
    .from(leads)
    .where(eq(leads.tenantId, tenantId))
    .orderBy(desc(leads.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.tenantId, tenantId));
  return { rows, total: count };
}

export async function createFinding(
  db: Database,
  tenantId: string,
  input: { leadId: string; summary: string; outcome?: 0 | 1 },
) {
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, input.leadId), eq(leads.tenantId, tenantId)))
    .limit(1);
  if (!lead) return null;

  let prior = createBetaPrior(1, 1);
  if (input.outcome !== undefined) {
    prior = betaUpdate(prior, input.outcome);
  }
  const status = hysteresisStep(HYSTERESIS, "cold", betaMean(prior));

  const [row] = await db
    .insert(findings)
    .values({
      tenantId,
      leadId: input.leadId,
      summary: input.summary,
      alpha: prior.alpha,
      beta: prior.beta,
      status,
    })
    .returning();
  return row;
}

export async function listFindings(db: Database, tenantId: string, page: number, pageSize: number) {
  const rows = await db
    .select()
    .from(findings)
    .where(eq(findings.tenantId, tenantId))
    .orderBy(desc(findings.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(findings)
    .where(eq(findings.tenantId, tenantId));
  return { rows, total: count };
}

export async function createDecision(
  db: Database,
  tenantId: string,
  input: { findingId: string; action: string; rationale: string },
) {
  const [finding] = await db
    .select()
    .from(findings)
    .where(and(eq(findings.id, input.findingId), eq(findings.tenantId, tenantId)))
    .limit(1);
  if (!finding) return null;

  const [row] = await db
    .insert(decisions)
    .values({ tenantId, findingId: input.findingId, action: input.action, rationale: input.rationale })
    .returning();
  return row;
}

export async function listDecisions(db: Database, tenantId: string, page: number, pageSize: number) {
  const rows = await db
    .select()
    .from(decisions)
    .where(eq(decisions.tenantId, tenantId))
    .orderBy(desc(decisions.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(decisions)
    .where(eq(decisions.tenantId, tenantId));
  return { rows, total: count };
}

export async function createApproval(
  db: Database,
  tenantId: string,
  input: { decisionId: string; approver: string; outcome: "approved" | "rejected" },
) {
  const [decision] = await db
    .select()
    .from(decisions)
    .where(and(eq(decisions.id, input.decisionId), eq(decisions.tenantId, tenantId)))
    .limit(1);
  if (!decision) return null;

  const [row] = await db
    .insert(approvals)
    .values({ tenantId, decisionId: input.decisionId, approver: input.approver, outcome: input.outcome })
    .returning();
  return row;
}

export async function listApprovals(db: Database, tenantId: string, page: number, pageSize: number) {
  const rows = await db
    .select()
    .from(approvals)
    .where(eq(approvals.tenantId, tenantId))
    .orderBy(desc(approvals.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(approvals)
    .where(eq(approvals.tenantId, tenantId));
  return { rows, total: count };
}

export async function runAutomation(
  db: Database,
  tenantId: string,
  input: { approvalId: string; trials: number; seed?: number },
) {
  const [approval] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, input.approvalId), eq(approvals.tenantId, tenantId)))
    .limit(1);
  if (!approval) return null;
  if (approval.outcome !== "approved") {
    throw new Error("Cannot run automation for a decision that was not approved");
  }

  const seed = input.seed ?? fnv1a(input.approvalId);
  const result = runMonteCarlo({ mean: 10, stdDev: 3 }, input.trials, seed);

  const [row] = await db
    .insert(automationRuns)
    .values({
      tenantId,
      approvalId: input.approvalId,
      seed,
      trials: input.trials,
      meanOutcome: result.mean,
      p05: result.p05,
      p95: result.p95,
      summary: { p50: result.p50, stdDev: result.stdDev },
    })
    .returning();
  return row;
}

export async function buildBoardPack(db: Database, tenantId: string) {
  const [leadRows, findingRows, decisionRows, approvalRows, runRows] = await Promise.all([
    db.select().from(leads).where(eq(leads.tenantId, tenantId)).orderBy(desc(leads.createdAt)).limit(50),
    db.select().from(findings).where(eq(findings.tenantId, tenantId)).orderBy(desc(findings.createdAt)).limit(50),
    db.select().from(decisions).where(eq(decisions.tenantId, tenantId)).orderBy(desc(decisions.createdAt)).limit(50),
    db.select().from(approvals).where(eq(approvals.tenantId, tenantId)).orderBy(desc(approvals.createdAt)).limit(50),
    db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.tenantId, tenantId))
      .orderBy(desc(automationRuns.createdAt))
      .limit(50),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    totals: {
      leads: leadRows.length,
      findings: findingRows.length,
      decisions: decisionRows.length,
      approvals: approvalRows.length,
      automationRuns: runRows.length,
    },
    leads: leadRows,
    findings: findingRows,
    decisions: decisionRows,
    approvals: approvalRows,
    automationRuns: runRows,
  };
}
