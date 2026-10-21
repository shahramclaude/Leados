// Maintenance mode: a read-only banner + write-queueing gate. Toggled via
// POST /api/admin/maintenance, enforced by withApiHandler for every mutating
// route, and surfaced on /api/health and the Health page.
import { db } from "@/db";
import { maintenanceState } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withDbSpan } from "@/lib/obs/tracing";

const ROW_ID = "global";
let cache: { enabled: boolean; reason: string | null; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 2000; // avoid a db round-trip on every single request

export async function isMaintenanceModeEnabled(): Promise<boolean> {
  const state = await getMaintenanceState();
  return state.enabled;
}

export async function getMaintenanceState(): Promise<{ enabled: boolean; reason: string | null; updatedAt?: string }> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { enabled: cache.enabled, reason: cache.reason };
  }
  const rows = await withDbSpan("maintenance_state.select", () =>
    db.select().from(maintenanceState).where(eq(maintenanceState.id, ROW_ID)).limit(1),
  );
  const row = rows[0];
  cache = { enabled: row?.enabled ?? false, reason: row?.reason ?? null, fetchedAt: Date.now() };
  return { enabled: cache.enabled, reason: cache.reason, updatedAt: row?.updatedAt?.toISOString() };
}

export async function setMaintenanceMode(enabled: boolean, reason: string | undefined, actor: string): Promise<void> {
  await withDbSpan("maintenance_state.upsert", () =>
    db
      .insert(maintenanceState)
      .values({ id: ROW_ID, enabled, reason: reason ?? null, updatedBy: actor, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: maintenanceState.id,
        set: { enabled, reason: reason ?? null, updatedBy: actor, updatedAt: new Date() },
      }),
  );
  cache = { enabled, reason: reason ?? null, fetchedAt: Date.now() };
}
