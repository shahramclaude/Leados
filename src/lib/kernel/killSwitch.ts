// =============================================================================
// LEADOS kernel — kill switches & capability overrides
// =============================================================================

import { db } from "@/db";
import { autonomySettings, capabilityOverrides } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { EnforcementMode } from "./types";

const SETTINGS_ID = 1;

export interface AutonomySettingsRow {
  id: number;
  paused: boolean;
  pausedReason: string | null;
  pausedAt: Date | null;
  anomalyTripwireActive: boolean;
  updatedAt: Date;
}

export async function getAutonomySettings(): Promise<AutonomySettingsRow> {
  const rows = await db.select().from(autonomySettings).where(eq(autonomySettings.id, SETTINGS_ID)).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db
    .insert(autonomySettings)
    .values({ id: SETTINGS_ID, paused: false, anomalyTripwireActive: false })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const retry = await db.select().from(autonomySettings).where(eq(autonomySettings.id, SETTINGS_ID)).limit(1);
  return retry[0];
}

export async function pauseAutonomy(reason: string): Promise<AutonomySettingsRow> {
  await getAutonomySettings();
  const [row] = await db
    .update(autonomySettings)
    .set({ paused: true, pausedReason: reason, pausedAt: new Date(), updatedAt: new Date() })
    .where(eq(autonomySettings.id, SETTINGS_ID))
    .returning();
  return row;
}

export async function resumeAutonomy(): Promise<AutonomySettingsRow> {
  await getAutonomySettings();
  const [row] = await db
    .update(autonomySettings)
    .set({ paused: false, pausedReason: null, pausedAt: null, anomalyTripwireActive: false, updatedAt: new Date() })
    .where(eq(autonomySettings.id, SETTINGS_ID))
    .returning();
  return row;
}

export async function tripAnomalyPause(reason: string): Promise<AutonomySettingsRow> {
  await getAutonomySettings();
  const [row] = await db
    .update(autonomySettings)
    .set({ paused: true, pausedReason: reason, pausedAt: new Date(), anomalyTripwireActive: true, updatedAt: new Date() })
    .where(eq(autonomySettings.id, SETTINGS_ID))
    .returning();
  return row;
}

export interface CapabilityOverrideRow {
  key: string;
  enabled: boolean;
  mode: EnforcementMode | null;
  dailyBudget: number | null;
}

export async function getCapabilityOverride(key: string): Promise<CapabilityOverrideRow | null> {
  const rows = await db.select().from(capabilityOverrides).where(eq(capabilityOverrides.key, key)).limit(1);
  if (rows.length === 0) return null;
  return rows[0] as CapabilityOverrideRow;
}

export async function listCapabilityOverrides(): Promise<CapabilityOverrideRow[]> {
  return (await db.select().from(capabilityOverrides)) as CapabilityOverrideRow[];
}

export async function setCapabilityOverride(
  key: string,
  patch: { enabled?: boolean; mode?: EnforcementMode | null; dailyBudget?: number | null },
  updatedBy: string,
): Promise<CapabilityOverrideRow> {
  const existing = await getCapabilityOverride(key);
  if (existing) {
    const [row] = await db
      .update(capabilityOverrides)
      .set({ ...patch, updatedBy, updatedAt: new Date() })
      .where(eq(capabilityOverrides.key, key))
      .returning();
    return row as CapabilityOverrideRow;
  }
  const [row] = await db
    .insert(capabilityOverrides)
    .values({
      key,
      enabled: patch.enabled ?? true,
      mode: patch.mode ?? null,
      dailyBudget: patch.dailyBudget ?? null,
      updatedBy,
    })
    .returning();
  return row as CapabilityOverrideRow;
}
