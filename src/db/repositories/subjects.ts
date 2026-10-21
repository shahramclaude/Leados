import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { subjects } from "@/db/schema";
import { NotFoundInOrgError } from "./orgScope";

export type NewSubject = {
  teamId?: string | null;
  name: string;
  roleTitle: string;
  riskScore?: number;
  isSample?: boolean;
};

/** List is always filtered by orgId at the SQL layer — never in memory. */
export async function listSubjects(orgId: string) {
  return db.select().from(subjects).where(eq(subjects.orgId, orgId)).orderBy(subjects.name);
}

/** Returns undefined (never a cross-org row) when the id belongs to another org. */
export async function getSubjectInOrg(orgId: string, id: string) {
  const rows = await db
    .select()
    .from(subjects)
    .where(and(eq(subjects.orgId, orgId), eq(subjects.id, id)))
    .limit(1);
  return rows[0];
}

export async function createSubject(orgId: string, input: NewSubject) {
  const [row] = await db
    .insert(subjects)
    .values({
      orgId,
      teamId: input.teamId ?? null,
      name: input.name,
      roleTitle: input.roleTitle,
      riskScore: input.riskScore ?? 0,
      isSample: input.isSample ?? false,
    })
    .returning();
  return row;
}

/**
 * Optimistic-concurrency update used by both the normal API path and the
 * offline sync endpoint. Throws NotFoundInOrgError if the row is not in this
 * org (prevents cross-tenant writes), and returns `{conflict: true}` if the
 * caller's `expectedVersion` does not match the stored version.
 */
export async function updateSubjectInOrg(
  orgId: string,
  id: string,
  patch: Partial<Pick<typeof subjects.$inferInsert, "name" | "roleTitle" | "riskScore" | "teamId">>,
  expectedVersion: number,
) {
  const existing = await getSubjectInOrg(orgId, id);
  if (!existing) {
    throw new NotFoundInOrgError("subject", id);
  }
  if (existing.version !== expectedVersion) {
    return { conflict: true as const, server: existing };
  }
  const [row] = await db
    .update(subjects)
    .set({ ...patch, version: existing.version + 1, updatedAt: sql`now()` })
    .where(and(eq(subjects.orgId, orgId), eq(subjects.id, id)))
    .returning();
  return { conflict: false as const, server: row };
}

export async function deleteSampleSubjects(orgId: string) {
  return db.delete(subjects).where(and(eq(subjects.orgId, orgId), eq(subjects.isSample, true)));
}

/** Org-scoped aggregate — the predicate lives in the SQL, not in app code. */
export async function countSubjectsByOrg(orgId: string) {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(subjects)
    .where(eq(subjects.orgId, orgId));
  return rows[0]?.count ?? 0;
}
