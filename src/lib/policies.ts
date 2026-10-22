// src/lib/policies.ts
//
// Policy lifecycle: draft -> approve -> publish -> attest -> review, with
// version diffs and attestation tracking. Every state transition and
// attestation writes an evidence event to the hash chain so "published" /
// "attested" status is always backed by a check-able record.

import { db } from "@/db";
import { policies, policyVersions, policyAttestations } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { appendAuditEvent } from "./audit";

export type PolicyStatus = "draft" | "approved" | "published" | "review";

export async function createPolicy(input: {
  code: string;
  title: string;
  owner: string;
  reviewCadenceDays?: number;
  initialContent: string;
}) {
  const [policy] = await db
    .insert(policies)
    .values({ code: input.code, title: input.title, owner: input.owner, reviewCadenceDays: input.reviewCadenceDays ?? 365 })
    .returning();

  const [version] = await db
    .insert(policyVersions)
    .values({ policyId: policy.id, versionNumber: 1, content: input.initialContent, status: "draft" })
    .returning();

  await db.update(policies).set({ currentVersionId: version.id }).where(eq(policies.id, policy.id));

  await appendAuditEvent({
    category: "policy_lifecycle",
    entityType: "policy",
    entityId: String(policy.id),
    action: "policy_drafted",
    payload: { code: input.code, versionNumber: 1 },
    actor: input.owner,
  });

  return { policy, version };
}

export async function listPolicies() {
  return db.select().from(policies);
}

export async function getPolicyWithVersions(policyId: number) {
  const [policy] = await db.select().from(policies).where(eq(policies.id, policyId));
  if (!policy) return null;
  const versions = await db
    .select()
    .from(policyVersions)
    .where(eq(policyVersions.policyId, policyId))
    .orderBy(desc(policyVersions.versionNumber));
  const attestations = await db
    .select()
    .from(policyAttestations)
    .where(
      eq(
        policyAttestations.policyVersionId,
        policy.currentVersionId ?? 0,
      ),
    );
  return { policy, versions, attestations };
}

/** Create a new draft version from the latest version's content (editable before approval). */
export async function draftNewVersion(policyId: number, content: string, actor: string) {
  const latest = await db
    .select()
    .from(policyVersions)
    .where(eq(policyVersions.policyId, policyId))
    .orderBy(desc(policyVersions.versionNumber))
    .limit(1);
  const nextNumber = (latest[0]?.versionNumber ?? 0) + 1;
  const [version] = await db
    .insert(policyVersions)
    .values({ policyId, versionNumber: nextNumber, content, status: "draft" })
    .returning();
  await db.update(policies).set({ status: "draft", currentVersionId: version.id }).where(eq(policies.id, policyId));
  await appendAuditEvent({
    category: "policy_lifecycle",
    entityType: "policy",
    entityId: String(policyId),
    action: "policy_new_draft",
    payload: { versionNumber: nextNumber },
    actor,
  });
  return version;
}

export async function approvePolicyVersion(versionId: number, approvedBy: string) {
  const evidence = await appendAuditEvent({
    category: "policy_lifecycle",
    entityType: "policy_version",
    entityId: String(versionId),
    action: "policy_approved",
    payload: { approvedBy },
    actor: approvedBy,
  });
  const [version] = await db
    .update(policyVersions)
    .set({ status: "approved", approvedBy, approvedAt: new Date().toISOString(), evidenceAuditEventId: evidence.id })
    .where(eq(policyVersions.id, versionId))
    .returning();
  await db.update(policies).set({ status: "approved" }).where(eq(policies.id, version.policyId));
  return version;
}

export async function publishPolicyVersion(versionId: number, actor: string) {
  const evidence = await appendAuditEvent({
    category: "policy_lifecycle",
    entityType: "policy_version",
    entityId: String(versionId),
    action: "policy_published",
    payload: {},
    actor,
  });
  const [version] = await db
    .update(policyVersions)
    .set({ status: "published", publishedAt: new Date().toISOString(), evidenceAuditEventId: evidence.id })
    .where(eq(policyVersions.id, versionId))
    .returning();
  const [policy] = await db.select().from(policies).where(eq(policies.id, version.policyId));
  const nextReview = new Date(Date.now() + (policy?.reviewCadenceDays ?? 365) * 86400000);
  await db
    .update(policies)
    .set({ status: "published", nextReviewDueAt: nextReview.toISOString() })
    .where(eq(policies.id, version.policyId));
  return version;
}

export async function attestPolicyVersion(versionId: number, attestant: string) {
  const evidence = await appendAuditEvent({
    category: "attestation",
    entityType: "policy_version",
    entityId: String(versionId),
    action: "policy_attested",
    payload: { attestant },
    actor: attestant,
  });
  const [row] = await db
    .insert(policyAttestations)
    .values({ policyVersionId: versionId, attestant, evidenceAuditEventId: evidence.id })
    .returning();
  return row;
}

/** Line-level diff between two policy version texts — simple LCS-based diff, good enough for review UI. */
export interface DiffLine {
  type: "same" | "added" | "removed";
  text: string;
}

export function diffPolicyVersions(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const m = a.length;
  const n = b.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: "removed", text: a[i] });
      i++;
    } else {
      out.push({ type: "added", text: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ type: "removed", text: a[i++] });
  while (j < n) out.push({ type: "added", text: b[j++] });
  return out;
}
