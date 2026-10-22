import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { featureFlagAudit, featureFlags } from "@/db/schema";

export type FeatureFlagRow = typeof featureFlags.$inferSelect;

export async function listFlags(orgId: string): Promise<FeatureFlagRow[]> {
  return db.select().from(featureFlags).where(eq(featureFlags.orgId, orgId));
}

export async function listAudit(orgId: string, limit = 25) {
  return db
    .select()
    .from(featureFlagAudit)
    .where(eq(featureFlagAudit.orgId, orgId))
    .orderBy(desc(featureFlagAudit.createdAt))
    .limit(limit);
}

export async function createFlag(orgId: string, key: string, actorId: string): Promise<FeatureFlagRow> {
  const [row] = await db
    .insert(featureFlags)
    .values({ orgId, key, enabled: false, updatedBy: actorId })
    .onConflictDoNothing()
    .returning();

  await db.insert(featureFlagAudit).values({ orgId, flagKey: key, action: "created", actorId });

  if (row) return row;
  const [existing] = await db
    .select()
    .from(featureFlags)
    .where(and(eq(featureFlags.orgId, orgId), eq(featureFlags.key, key)));
  return existing;
}

export async function setFlag(orgId: string, key: string, enabled: boolean, actorId: string): Promise<FeatureFlagRow | undefined> {
  const [row] = await db
    .update(featureFlags)
    .set({ enabled, updatedBy: actorId, updatedAt: new Date() })
    .where(and(eq(featureFlags.orgId, orgId), eq(featureFlags.key, key)))
    .returning();

  if (row) {
    await db.insert(featureFlagAudit).values({
      orgId,
      flagKey: key,
      action: enabled ? "enabled" : "disabled",
      actorId,
    });
  }

  return row;
}
