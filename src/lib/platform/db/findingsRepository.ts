// src/lib/platform/db/findingsRepository.ts — the reference tenant-scoped
// repository. EVERY exported function takes `orgId` as a required (not
// optional) first-class argument and includes it in the WHERE clause. This
// is the mechanism `scripts/test-tenant-isolation.ts` exercises directly:
// calling `listFindings(orgB)` must never be able to see org A's rows no
// matter what a caller does, because there is no code path that queries
// `findings` without an `orgId` predicate.

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { findings, type Finding, type NewFinding } from "@/db/schema";

export async function listFindings(orgId: string): Promise<Finding[]> {
  return db.select().from(findings).where(eq(findings.orgId, orgId)).orderBy(desc(findings.createdAt));
}

export async function getFinding(orgId: string, findingId: string): Promise<Finding | undefined> {
  const [row] = await db
    .select()
    .from(findings)
    .where(and(eq(findings.orgId, orgId), eq(findings.id, findingId)))
    .limit(1);
  return row;
}

/** Idempotent create: replaying the same `clientMutationId` (offline queue retry) returns the existing row instead of duplicating it. */
export async function createFinding(
  orgId: string,
  input: Omit<NewFinding, "orgId">,
): Promise<{ finding: Finding; wasExisting: boolean }> {
  if (input.clientMutationId) {
    const [existing] = await db
      .select()
      .from(findings)
      .where(and(eq(findings.orgId, orgId), eq(findings.clientMutationId, input.clientMutationId)))
      .limit(1);
    if (existing) return { finding: existing, wasExisting: true };
  }
  const [row] = await db
    .insert(findings)
    .values({ ...input, orgId })
    .returning();
  return { finding: row, wasExisting: false };
}

export interface UpdateResult {
  outcome: "updated" | "conflict" | "not_found";
  finding?: Finding;
}

/** Optimistic-concurrency update: the caller must supply the `updatedAt` it last read. If the row moved on, the current server copy is returned so the client can offer a merge/keep-mine choice. */
export async function updateFindingStatus(
  orgId: string,
  findingId: string,
  patch: { status?: string; summary?: string },
  expectedUpdatedAt: string,
): Promise<UpdateResult> {
  const current = await getFinding(orgId, findingId);
  if (!current) return { outcome: "not_found" };

  if (new Date(current.updatedAt).getTime() !== new Date(expectedUpdatedAt).getTime()) {
    return { outcome: "conflict", finding: current };
  }

  const [row] = await db
    .update(findings)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(findings.orgId, orgId), eq(findings.id, findingId)))
    .returning();
  return { outcome: "updated", finding: row };
}

export async function seedSampleFindings(orgId: string, team: string): Promise<void> {
  const samples: Array<Omit<NewFinding, "orgId">> = [
    {
      title: "Sprint velocity dropped 30%",
      domain: "delivery",
      team,
      severity: 3,
      summary: "Synthetic sample finding for first-run exploration.",
      isSample: true,
    },
    {
      title: "Manager 1:1 cadence slipping",
      domain: "people",
      team,
      severity: 2,
      summary: "Synthetic sample finding for first-run exploration.",
      isSample: true,
    },
    {
      title: "Customer escalation unresolved 5 days",
      domain: "customer",
      team,
      severity: 5,
      summary: "Synthetic sample finding for first-run exploration.",
      isSample: true,
    },
  ];
  await db.insert(findings).values(samples.map((s) => ({ ...s, orgId })));
}

export async function countFindingsForOrg(orgId: string): Promise<number> {
  const rows = await db.select({ id: findings.id }).from(findings).where(eq(findings.orgId, orgId));
  return rows.length;
}
