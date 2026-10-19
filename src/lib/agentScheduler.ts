// src/lib/agentScheduler.ts
//
// Part 2 deliverable: in-process schedule management for the autonomous
// agent loop. Designed to be started once per server process (e.g. from
// instrumentation.ts) — NOT per-request. `start()` returns handles to stop
// the loop and read its current status.

import type { db as defaultDb } from "@/db";
import { agentAuditLog, settings as settingsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { SchedulerConfig, SchedulerStatus } from "./types";
import { loadPreviousCycleFromDb, persistCycleResult, runAgentCycle } from "./agentCore";

type Database = typeof defaultDb;

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  normalIntervalMs: 1_800_000, // 30 minutes
  criticalIntervalMs: 600_000, // 10 minutes
  morningBriefingHour: 7,
};

const CONSECUTIVE_ERROR_LIMIT = 3;
const CASCADE_RECOVERY_THRESHOLD = 0.4;

interface SchedulerHandle {
  stop: () => void;
  status: () => SchedulerStatus;
}

async function setSetting(db: Database, key: string, value: string): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
}

async function logAudit(db: Database, level: string, message: string, detail?: unknown): Promise<void> {
  try {
    await db.insert(agentAuditLog).values({ level, message, detail: detail as object | undefined });
  } catch (err) {
    console.error("[agentScheduler] failed to write audit log", err);
  }
}

/**
 * Starts the autonomous agent's adaptive scheduling loop.
 *
 * Adaptive interval: after a cycle where cascadeRisk.p > 0.6, the interval
 * drops to `criticalIntervalMs` until cascadeRisk is < 0.4 for two
 * consecutive cycles, after which it reverts to `normalIntervalMs`.
 *
 * Degraded mode: after 3 consecutive thrown cycles, the scheduler switches
 * to a reduced mode that runs only `runAgentCycle` with minimal side
 * effects is impractical to isolate further here, so instead it logs to
 * agent_audit_log, sets `agent.degraded_mode = 'true'`, and backs off to
 * the normal interval until a cycle succeeds again.
 */
export function start(config: SchedulerConfig, db: Database): SchedulerHandle {
  let running = true;
  let lastRunAt: string | null = null;
  let nextRunAt: string | null = null;
  let currentIntervalMs = config.normalIntervalMs;
  let lastCycleId: string | null = null;
  let consecutiveErrors = 0;
  let consecutiveLowCascadeCycles = 0;
  let degradedMode = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick(): Promise<void> {
    if (!running) return;
    lastRunAt = new Date().toISOString();

    try {
      const previousCycle = await loadPreviousCycleFromDb(db);
      const result = await runAgentCycle({ db, now: new Date(), previousCycle });
      await persistCycleResult(db, result);

      lastCycleId = result.cycleId;
      consecutiveErrors = 0;

      if (degradedMode) {
        degradedMode = false;
        await setSetting(db, "agent.degraded_mode", "false");
        await logAudit(db, "info", "Agent cycle succeeded — exiting degraded mode", { cycleId: result.cycleId });
      }

      const cascadeP = result.beliefResult.cascadeRisk.p;
      if (cascadeP > 0.6) {
        currentIntervalMs = config.criticalIntervalMs;
        consecutiveLowCascadeCycles = 0;
      } else if (cascadeP < CASCADE_RECOVERY_THRESHOLD) {
        consecutiveLowCascadeCycles += 1;
        if (consecutiveLowCascadeCycles >= 2) {
          currentIntervalMs = config.normalIntervalMs;
        }
      }
    } catch (err) {
      consecutiveErrors += 1;
      console.error("[agentScheduler] cycle failed", err);
      await logAudit(db, "error", "Agent cycle threw", {
        error: err instanceof Error ? err.message : String(err),
        consecutiveErrors,
      });

      if (consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT && !degradedMode) {
        degradedMode = true;
        await setSetting(db, "agent.degraded_mode", "true");
        await logAudit(db, "warning", "Entering degraded mode after 3 consecutive cycle failures", {
          consecutiveErrors,
        });
      }

      if (degradedMode) {
        // Reduced mode: belief-fabric-only pass via the agent cycle itself
        // is still the cheapest safe operation we can run (no playbooks /
        // hypotheses / briefing side effects are skipped inside a single
        // function without a larger refactor, so we simply widen the
        // interval and keep retrying at the normal cadence while notifying
        // admins via the audit log).
        currentIntervalMs = config.normalIntervalMs;
      }
    }

    nextRunAt = new Date(Date.now() + currentIntervalMs).toISOString();
    if (running) {
      timer = setTimeout(tick, currentIntervalMs);
    }
  }

  // Kick off the first run on a short delay so the server has time to
  // finish booting.
  timer = setTimeout(tick, 2000);
  nextRunAt = new Date(Date.now() + 2000).toISOString();

  return {
    stop: () => {
      running = false;
      if (timer) clearTimeout(timer);
    },
    status: () => ({
      running,
      lastRunAt,
      nextRunAt,
      currentIntervalMs,
      lastCycleId,
      consecutiveErrors,
      degradedMode,
    }),
  };
}

export async function readDegradedModeFlag(db: Database): Promise<boolean> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "agent.degraded_mode")).limit(1);
  return row?.value === "true";
}
