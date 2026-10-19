// schedule.ts
//
// NOTE: recreated for this sandbox — see the comment at the top of
// src/db/schema.ts.
//
// Leados' autonomous agent is invoked by an external cron/scheduler hitting
// POST /api/autonomous/run (protected by CRON_SECRET) — Next.js route
// handlers cannot host a long-lived in-process timer. This module is the
// single source of truth for the schedule's *configuration* and the pure
// helpers used to compute "when should the next run happen" / "is the
// schedule healthy", so both the run route and the status route agree.

import type { AgentConfig } from "./src/lib/types";

// DESIGN PARAMETER: default cadence + thresholds for the autonomous loop.
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  normalIntervalMs: 30 * 60 * 1000, // 30 min
  criticalIntervalMs: 10 * 60 * 1000, // 10 min
  morningBriefingHour: 7, // 07:00 UTC
  hypothesisLookbackDays: 90,
  calibrationLookbackDays: 30,
  maxPlaybookAutoTriggers: 3,
};

/**
 * A schedule is considered:
 *  - "stopped"  — it has never run.
 *  - "degraded" — the last run is overdue by more than 3x its interval.
 *  - "running"  — otherwise.
 */
export type ScheduleStatus = "running" | "degraded" | "stopped";

export function computeNextRunAt(
  lastRunAt: Date | null,
  intervalMs: number,
  now: Date = new Date(),
): Date {
  if (!lastRunAt) return now;
  return new Date(lastRunAt.getTime() + intervalMs);
}

export function getScheduleStatus(
  lastRunAt: Date | null,
  intervalMs: number,
  now: Date = new Date(),
): ScheduleStatus {
  if (!lastRunAt) return "stopped";
  const overdueBy = now.getTime() - (lastRunAt.getTime() + intervalMs);
  if (overdueBy > intervalMs * 3) return "degraded";
  return "running";
}

const schedule = {
  DEFAULT_AGENT_CONFIG,
  computeNextRunAt,
  getScheduleStatus,
};

export default schedule;
