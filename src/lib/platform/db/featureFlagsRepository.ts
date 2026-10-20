// src/lib/platform/db/featureFlagsRepository.ts — per-org feature flags,
// always merged over the hard-coded defaults so an org with zero rows still
// gets sane behavior.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orgFeatureFlags } from "@/db/schema";
import { DEFAULT_FEATURE_FLAGS, type FeatureFlagKey } from "@/lib/domain/types";

export async function listFlags(orgId: string): Promise<Record<FeatureFlagKey, boolean>> {
  const rows = await db.select().from(orgFeatureFlags).where(eq(orgFeatureFlags.orgId, orgId));
  const result = { ...DEFAULT_FEATURE_FLAGS };
  for (const row of rows) {
    if (row.key in result) {
      (result as Record<string, boolean>)[row.key] = row.enabled;
    }
  }
  return result;
}

export async function setFlag(orgId: string, key: FeatureFlagKey, enabled: boolean): Promise<void> {
  const existing = await db
    .select()
    .from(orgFeatureFlags)
    .where(and(eq(orgFeatureFlags.orgId, orgId), eq(orgFeatureFlags.key, key)))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(orgFeatureFlags)
      .set({ enabled, updatedAt: new Date() })
      .where(and(eq(orgFeatureFlags.orgId, orgId), eq(orgFeatureFlags.key, key)));
  } else {
    await db.insert(orgFeatureFlags).values({ orgId, key, enabled });
  }
}

export async function isEnabled(orgId: string, key: FeatureFlagKey): Promise<boolean> {
  const flags = await listFlags(orgId);
  return flags[key];
}
