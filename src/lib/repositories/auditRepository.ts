// src/lib/repositories/auditRepository.ts — append-only audit trail for
// export/import/backup/restore/erasure/retention actions (NOT the same
// table as the business event log, but held to the same append-only
// discipline at the repository level — nothing here ever updates/deletes).
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, retentionPolicies } from "@/db/schema";

export type AuditLogRow = typeof auditLog.$inferSelect;
export type RetentionPolicyRow = typeof retentionPolicies.$inferSelect;

export async function recordAudit(action: string, details: Record<string, unknown>, opts: { actorId?: string; targetId?: string } = {}): Promise<AuditLogRow> {
  const [row] = await db
    .insert(auditLog)
    .values({ action, details, actorId: opts.actorId ?? "system", targetId: opts.targetId ?? null })
    .returning();
  return row;
}

export async function listAudit(limit = 100): Promise<AuditLogRow[]> {
  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
}

export async function listRetentionPolicies(): Promise<RetentionPolicyRow[]> {
  return db.select().from(retentionPolicies);
}

export async function upsertRetentionPolicy(policy: {
  eventType: string;
  retentionDays: number;
  purgeable: boolean;
  rationale: string;
}): Promise<RetentionPolicyRow> {
  const [row] = await db
    .insert(retentionPolicies)
    .values({ ...policy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: retentionPolicies.eventType,
      set: { retentionDays: policy.retentionDays, purgeable: policy.purgeable, rationale: policy.rationale, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function getRetentionPolicy(eventType: string): Promise<RetentionPolicyRow | null> {
  const [row] = await db.select().from(retentionPolicies).where(eq(retentionPolicies.eventType, eventType)).limit(1);
  return row ?? null;
}
