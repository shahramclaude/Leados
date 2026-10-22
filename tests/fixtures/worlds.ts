import type { TxDb } from "./db";
import { tenants, users, findings, decisions, approvals } from "@/db/schema";

/**
 * Seeded "world" builders: deterministic fixture graphs used across
 * integration/e2e tests so that "happy path", "tenancy isolation", and
 * "pagination" tests all start from a known, reproducible shape instead of
 * ad-hoc inline inserts per test.
 */

export interface SeededWorld {
  tenantA: { id: number; slug: string };
  tenantB: { id: number; slug: string };
  memberA: { id: number; apiKey: string };
  adminA: { id: number; apiKey: string };
  memberB: { id: number; apiKey: string };
}

/**
 * Builds two isolated tenants (A and B), each with a member + (tenant A
 * also gets an admin) so tests can assert both "happy path" and "tenancy
 * isolation" (B must never see A's rows) in one fixture.
 */
export async function seedTwoTenantWorld(db: TxDb): Promise<SeededWorld> {
  const [tenantA] = await db
    .insert(tenants)
    .values({ slug: "tenant-a", name: "Tenant A" })
    .returning();
  const [tenantB] = await db
    .insert(tenants)
    .values({ slug: "tenant-b", name: "Tenant B" })
    .returning();

  const [memberA] = await db
    .insert(users)
    .values({
      tenantId: tenantA.id,
      email: "member-a@example.com",
      role: "member",
      apiKey: "key-member-a",
    })
    .returning();
  const [adminA] = await db
    .insert(users)
    .values({
      tenantId: tenantA.id,
      email: "admin-a@example.com",
      role: "admin",
      apiKey: "key-admin-a",
    })
    .returning();
  const [memberB] = await db
    .insert(users)
    .values({
      tenantId: tenantB.id,
      email: "member-b@example.com",
      role: "member",
      apiKey: "key-member-b",
    })
    .returning();

  return {
    tenantA: { id: tenantA.id, slug: tenantA.slug },
    tenantB: { id: tenantB.id, slug: tenantB.slug },
    memberA: { id: memberA.id, apiKey: memberA.apiKey },
    adminA: { id: adminA.id, apiKey: adminA.apiKey },
    memberB: { id: memberB.id, apiKey: memberB.apiKey },
  };
}

/** Seeds `n` findings for a tenant — used for pagination tests. */
export async function seedFindings(
  db: TxDb,
  tenantId: number,
  n: number,
  createdBy?: number,
): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const [row] = await db
      .insert(findings)
      .values({
        tenantId,
        title: `Finding ${i + 1}`,
        description: `Seeded finding ${i + 1}`,
        createdBy,
      })
      .returning({ id: findings.id });
    ids.push(row.id);
  }
  return ids;
}

/** Seeds a finding -> decision -> approval chain for golden-journey tests. */
export async function seedDecisionChain(
  db: TxDb,
  tenantId: number,
  createdBy: number,
) {
  const [finding] = await db
    .insert(findings)
    .values({
      tenantId,
      title: "Checkout latency regression",
      description: "P95 latency doubled after last deploy",
      createdBy,
    })
    .returning();

  const [decision] = await db
    .insert(decisions)
    .values({
      tenantId,
      findingId: finding.id,
      title: "Roll back checkout deploy",
      rationale: "Fastest mitigation while root cause is investigated",
      optimisticEstimate: 1,
      likelyEstimate: 2,
      pessimisticEstimate: 5,
    })
    .returning();

  const [approval] = await db
    .insert(approvals)
    .values({
      tenantId,
      decisionId: decision.id,
      approverId: createdBy,
    })
    .returning();

  return { finding, decision, approval };
}
