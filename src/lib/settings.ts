// Small typed key/value helper over `system_settings`, used for maintenance
// mode, the incident banner, and the stream-hub heartbeat consumed by
// graceful shutdown.
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  if (rows.length === 0) return fallback;
  return rows[0].value as T;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key, value: value as object, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: value as object, updatedAt: new Date() },
    });
}

export async function getSettingUpdatedAt(key: string): Promise<Date | null> {
  const rows = await db
    .select({ updatedAt: systemSettings.updatedAt })
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  return rows.length ? rows[0].updatedAt : null;
}

export interface MaintenanceState {
  enabled: boolean;
  reason: string | null;
  since: string | null;
}

export const MAINTENANCE_KEY = "maintenance";
export const INCIDENT_KEY = "incident";
export const STREAM_HUB_KEY = "stream_hub";
export const DRAINING_KEY = "draining";

export interface IncidentState {
  active: boolean;
  severity: "minor" | "major" | "critical";
  message: string;
  runbookUrl: string | null;
  since: string | null;
}

export const DEFAULT_MAINTENANCE: MaintenanceState = { enabled: false, reason: null, since: null };
export const DEFAULT_INCIDENT: IncidentState = {
  active: false,
  severity: "minor",
  message: "",
  runbookUrl: null,
  since: null,
};

/** Touch a liveness row used only to smoke-test write access / round-trip latency. */
export async function touchHeartbeat(key: string): Promise<void> {
  await db.execute(sql`select 1`);
  await setSetting(key, { heartbeatAt: new Date().toISOString() });
}
