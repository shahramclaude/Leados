// src/lib/repositories/settingsRepository.ts — singleton settings row
// (org timezone + operational knobs). Not event-sourced on purpose:
// settings are operator configuration, not a business fact we need
// history/replay for.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { isValidIanaTimezone } from "@/lib/time";

export type SettingsRow = typeof settings.$inferSelect;

export async function getSettings(): Promise<SettingsRow> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (row) return row;
  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  if (created) return created;
  const [existing] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return existing;
}

export async function updateSettings(patch: { orgTimezone?: string; backupReminderDays?: number }): Promise<SettingsRow> {
  if (patch.orgTimezone && !isValidIanaTimezone(patch.orgTimezone)) {
    throw new Error(`"${patch.orgTimezone}" is not a recognized IANA timezone.`);
  }
  await getSettings();
  const [row] = await db
    .update(settings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(settings.id, 1))
    .returning();
  return row;
}
