import { db } from "@/db";
import { actionClasses, delegatedPermissions, policyAudit } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { defaultActionClasses, type ActionClass, type PromotionRecord } from "@/lib/autonomyKernel";

export async function ensureActionClasses() {
  const existing = await db.select().from(actionClasses);
  if (existing.length > 0) return existing;
  const defaults = defaultActionClasses();
  const inserted = await db.insert(actionClasses).values(defaults).returning();
  return inserted;
}

export async function getActionClassByKey(key: string) {
  const rows = await db.select().from(actionClasses).where(eq(actionClasses.key, key));
  return rows[0] ?? null;
}

export async function toActionClass(row: typeof actionClasses.$inferSelect): Promise<ActionClass> {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    tier: row.tier as ActionClass["tier"],
    successCount: row.successCount,
    totalCount: row.totalCount,
    promotionHistory: row.promotionHistory as PromotionRecord[],
  };
}

export async function recordClassOutcome(actionClassKey: string, approved: boolean) {
  const row = await getActionClassByKey(actionClassKey);
  if (!row) return;
  await db
    .update(actionClasses)
    .set({
      totalCount: row.totalCount + 1,
      successCount: row.successCount + (approved ? 1 : 0),
    })
    .where(eq(actionClasses.id, row.id));
}

export async function getGrant(personId: string, actionClassId: string) {
  const rows = await db
    .select()
    .from(delegatedPermissions)
    .where(and(eq(delegatedPermissions.personId, personId), eq(delegatedPermissions.actionClassId, actionClassId)));
  return rows[0] ?? null;
}

export async function audit(entry: {
  actorType: "system" | "human";
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}) {
  await db.insert(policyAudit).values({
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    details: entry.details ?? {},
  });
}
