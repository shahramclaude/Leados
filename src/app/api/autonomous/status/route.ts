// GET /api/autonomous/status
//
// Read-only health/summary view over the autonomous agent: the last cycle,
// a short history, when the next cycle is expected, and rollups useful for
// a dashboard widget.

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  agentCycles,
  hypotheses,
  hypothesisResolutions,
  notifications,
  playbookInstances,
} from "@/db/schema";
import { computeNextRunAt, getScheduleStatus, DEFAULT_AGENT_CONFIG } from "../../../../../schedule";

export const dynamic = "force-dynamic";

function summarizeCycle(row: typeof agentCycles.$inferSelect) {
  return {
    cycleId: row.id,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    status: row.status,
    orgHealthScore: row.orgHealthScore,
    riskProfile: row.riskProfile,
    criticalCount: row.criticalCount,
    cascadeCount: row.cascadeCount,
    playbooksTriggered: row.playbooksTriggered,
    hypothesesCreated: row.hypothesesCreated,
    hypothesesResolved: row.hypothesesResolved,
    adaptedInterval: row.adaptedInterval,
    totalDurationMs: row.totalDurationMs,
  };
}

export async function GET() {
  try {
    const recentCycles = await db
      .select()
      .from(agentCycles)
      .orderBy(desc(agentCycles.startedAt))
      .limit(5);

    const lastCycle = recentCycles[0] ? summarizeCycle(recentCycles[0]) : null;
    const lastFiveCycles = recentCycles.map(summarizeCycle);

    const intervalMs = lastCycle?.adaptedInterval
      ? DEFAULT_AGENT_CONFIG.criticalIntervalMs
      : DEFAULT_AGENT_CONFIG.normalIntervalMs;

    const lastRunAt = lastCycle?.completedAt ?? lastCycle?.startedAt ?? null;
    const nextRunAt = computeNextRunAt(lastRunAt, intervalMs);
    const scheduleStatus = getScheduleStatus(lastRunAt, intervalMs);

    const openHypothesesRows = await db
      .select({ id: hypotheses.id })
      .from(hypotheses)
      .where(eq(hypotheses.status, "open"));

    const weekAgo = new Date(Date.now() - 7 * 86400000);

    const playbooksTriggeredWeekRows = await db
      .select({ id: playbookInstances.id })
      .from(playbookInstances)
      .where(and(eq(playbookInstances.source, "autonomous_agent"), gte(playbookInstances.triggeredAt, weekAgo)));

    const hypothesesResolvedWeekRows = await db
      .select({ id: hypothesisResolutions.id })
      .from(hypothesisResolutions)
      .where(gte(hypothesisResolutions.resolvedAt, weekAgo));

    const rulesCalibratedWeek = recentCycles
      .filter((c) => c.startedAt >= weekAgo)
      .length; // calibration happens every cycle; count cycles as a proxy

    const criticalFindingsNewWeekRows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(gte(notifications.createdAt, weekAgo));

    return Response.json({
      ok: true,
      lastCycle,
      lastFiveCycles,
      nextRunAt,
      scheduleStatus,
      openHypotheses: openHypothesesRows.length,
      weeklyStats: {
        playbooksTriggered: playbooksTriggeredWeekRows.length,
        hypothesesResolved: hypothesesResolvedWeekRows.length,
        rulesCalibrated: rulesCalibratedWeek,
        criticalFindingsNew: criticalFindingsNewWeekRows.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
