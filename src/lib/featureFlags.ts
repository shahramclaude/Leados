// LEADOS — Part 38 / Part 15 compatibility shim: feature flag registry.
//
// Minimal flag store with a "degrade" and "restore" path so the assurance
// system's "degrade" remediation tier has somewhere real to act. Every
// mutation is audited (Part 19) so it is reversible and inspectable.

import { db } from "@/db";
import { featureFlags } from "@/db/schema";
import { eq } from "drizzle-orm";
import { appendAudit } from "@/lib/audit";

export const SEED_FLAGS: Array<{ key: string; name: string; description: string }> = [
  {
    key: "ai-auto-draft",
    name: "AI auto-draft generation",
    description: "Lets the AI draft outbound content automatically without a human-in-the-loop step.",
  },
  {
    key: "ai-lead-scoring",
    name: "AI lead scoring",
    description: "Uses the calibrated model to rank/score leads for prioritization.",
  },
  {
    key: "semantic-retrieval",
    name: "Semantic retrieval augmentation",
    description: "Uses the retrieval index to augment AI answers with company knowledge.",
  },
];

export async function ensureSeedFlags() {
  for (const flag of SEED_FLAGS) {
    const existing = await db.select().from(featureFlags).where(eq(featureFlags.key, flag.key)).limit(1);
    if (existing.length === 0) {
      await db.insert(featureFlags).values({ ...flag, enabled: true, degraded: false });
    }
  }
}

export async function listFlags() {
  return db.select().from(featureFlags).orderBy(featureFlags.key);
}

export async function getFlag(key: string) {
  const [row] = await db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
  return row ?? null;
}

export async function degradeFlag(key: string, reason: string, checkId: string) {
  const before = await getFlag(key);
  const [after] = await db
    .update(featureFlags)
    .set({
      enabled: false,
      degraded: true,
      degradedReason: reason,
      degradedByCheckId: checkId,
      degradedAt: new Date(),
      restoredAt: null,
      updatedAt: new Date(),
    })
    .where(eq(featureFlags.key, key))
    .returning();

  await appendAudit({
    actor: "assurance-system",
    action: "feature.degrade",
    entityType: "feature_flag",
    entityId: key,
    beforeState: before,
    afterState: after,
  });

  return after;
}

export async function restoreFlag(key: string, actor = "ops-user") {
  const before = await getFlag(key);
  const [after] = await db
    .update(featureFlags)
    .set({
      enabled: true,
      degraded: false,
      degradedReason: null,
      degradedByCheckId: null,
      restoredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(featureFlags.key, key))
    .returning();

  await appendAudit({
    actor,
    action: "feature.restore",
    entityType: "feature_flag",
    entityId: key,
    beforeState: before,
    afterState: after,
  });

  return after;
}
