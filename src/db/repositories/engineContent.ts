import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { briefings, findings, playbooks } from "@/db/schema";
import { NotFoundInOrgError } from "./orgScope";

export type EngineRecord = { templateKey: string; params: Record<string, unknown>; subjectId?: string | null };

export async function listBriefings(orgId: string) {
  return db.select().from(briefings).where(eq(briefings.orgId, orgId)).orderBy(briefings.createdAt);
}

export async function getBriefingInOrg(orgId: string, id: string) {
  const rows = await db
    .select()
    .from(briefings)
    .where(and(eq(briefings.orgId, orgId), eq(briefings.id, id)))
    .limit(1);
  return rows[0];
}

export async function createBriefing(
  orgId: string,
  input: EngineRecord & { severity?: string; isSample?: boolean },
) {
  const [row] = await db
    .insert(briefings)
    .values({
      orgId,
      subjectId: input.subjectId ?? null,
      templateKey: input.templateKey,
      params: input.params,
      severity: input.severity ?? "info",
      isSample: input.isSample ?? false,
    })
    .returning();
  return row;
}

export async function updateBriefingInOrg(
  orgId: string,
  id: string,
  patch: { params: Record<string, unknown> },
  expectedVersion: number,
) {
  const existing = await getBriefingInOrg(orgId, id);
  if (!existing) throw new NotFoundInOrgError("briefing", id);
  if (existing.version !== expectedVersion) {
    return { conflict: true as const, server: existing };
  }
  const [row] = await db
    .update(briefings)
    .set({ params: patch.params, version: existing.version + 1, updatedAt: sql`now()` })
    .where(and(eq(briefings.orgId, orgId), eq(briefings.id, id)))
    .returning();
  return { conflict: false as const, server: row };
}

export async function listFindings(orgId: string) {
  return db.select().from(findings).where(eq(findings.orgId, orgId)).orderBy(findings.createdAt);
}

export async function createFinding(orgId: string, input: EngineRecord & { isSample?: boolean }) {
  const [row] = await db
    .insert(findings)
    .values({
      orgId,
      subjectId: input.subjectId ?? null,
      templateKey: input.templateKey,
      params: input.params,
      isSample: input.isSample ?? false,
    })
    .returning();
  return row;
}

export async function listPlaybooks(orgId: string) {
  return db.select().from(playbooks).where(eq(playbooks.orgId, orgId)).orderBy(playbooks.createdAt);
}

export async function createPlaybook(orgId: string, input: EngineRecord & { isSample?: boolean }) {
  const [row] = await db
    .insert(playbooks)
    .values({
      orgId,
      templateKey: input.templateKey,
      params: input.params,
      isSample: input.isSample ?? false,
    })
    .returning();
  return row;
}

export async function deleteSampleEngineContent(orgId: string) {
  await db.delete(playbooks).where(and(eq(playbooks.orgId, orgId), eq(playbooks.isSample, true)));
  await db.delete(findings).where(and(eq(findings.orgId, orgId), eq(findings.isSample, true)));
  await db.delete(briefings).where(and(eq(briefings.orgId, orgId), eq(briefings.isSample, true)));
}

/** Org-scoped aggregate: average risk surfaced per severity, scoped in SQL. */
export async function countBriefingsBySeverity(orgId: string) {
  return db
    .select({ severity: briefings.severity, count: sql<number>`count(*)::int` })
    .from(briefings)
    .where(eq(briefings.orgId, orgId))
    .groupBy(briefings.severity);
}
