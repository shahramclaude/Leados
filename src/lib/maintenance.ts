// Maintenance mode: read-only enforcement + write queueing.
//
// When maintenance mode is enabled, mutating API calls (POST/PUT/PATCH/DELETE)
// are not rejected outright — they are persisted to `deferred_writes` and
// replayed once maintenance ends (see scripts/flush-deferred-writes.mjs and
// POST /api/maintenance/flush). This is enforced in `src/proxy.ts` (Next.js
// 16's request-interception layer) ahead of the route handlers.
import { db } from "@/db";
import { deferredWrites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSetting, setSetting, MAINTENANCE_KEY, DEFAULT_MAINTENANCE } from "./settings";
import type { MaintenanceState } from "./settings";
import { logger } from "./logger";

const log = logger.child({ component: "maintenance" });

export async function getMaintenanceState(): Promise<MaintenanceState> {
  return getSetting(MAINTENANCE_KEY, DEFAULT_MAINTENANCE);
}

export async function setMaintenanceState(enabled: boolean, reason?: string): Promise<MaintenanceState> {
  const state: MaintenanceState = {
    enabled,
    reason: enabled ? reason ?? "maintenance in progress" : null,
    since: enabled ? new Date().toISOString() : null,
  };
  await setSetting(MAINTENANCE_KEY, state);
  log.info("maintenance.state_changed", { ...state });
  return state;
}

// Paths that must always work even while in maintenance mode (ops/health surface).
export const MAINTENANCE_BYPASS_PREFIXES = [
  "/api/health",
  "/api/metrics",
  "/api/maintenance",
  "/api/_internal",
  "/api/trace",
  "/api/incident",
];

export function isBypassPath(pathname: string): boolean {
  return MAINTENANCE_BYPASS_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function enqueueDeferredWrite(opts: {
  method: string;
  path: string;
  body: unknown;
  correlationId: string;
}): Promise<string> {
  const [row] = await db
    .insert(deferredWrites)
    .values({
      method: opts.method,
      path: opts.path,
      body: (opts.body ?? {}) as object,
      correlationId: opts.correlationId,
      status: "queued",
    })
    .returning();
  log.info("maintenance.write_queued", { id: row.id, method: opts.method, path: opts.path });
  return row.id;
}

export interface ReplayResult {
  total: number;
  replayed: number;
  failed: number;
}

/** Replay queued writes in FIFO order against this same app, once maintenance
 * has ended. Used by scripts/flush-deferred-writes.mjs and /api/maintenance/flush. */
export async function replayDeferredWrites(baseUrl: string): Promise<ReplayResult> {
  const queued = await db
    .select()
    .from(deferredWrites)
    .where(eq(deferredWrites.status, "queued"))
    .orderBy(deferredWrites.createdAt);

  let replayed = 0;
  let failed = 0;
  for (const row of queued) {
    try {
      const res = await fetch(`${baseUrl}${row.path}`, {
        method: row.method,
        headers: {
          "content-type": "application/json",
          "x-correlation-id": row.correlationId,
          "x-replayed-write": "true",
        },
        body: row.method === "GET" || row.method === "DELETE" ? undefined : JSON.stringify(row.body),
      });
      if (!res.ok) throw new Error(`replay failed with HTTP ${res.status}`);
      await db
        .update(deferredWrites)
        .set({ status: "replayed", replayedAt: new Date() })
        .where(eq(deferredWrites.id, row.id));
      replayed += 1;
    } catch (err) {
      await db
        .update(deferredWrites)
        .set({ status: "failed", lastError: String(err) })
        .where(eq(deferredWrites.id, row.id));
      failed += 1;
      log.error("maintenance.replay_failed", { id: row.id, error: String(err) });
    }
  }
  return { total: queued.length, replayed, failed };
}
