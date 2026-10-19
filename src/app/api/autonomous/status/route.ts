// src/app/api/autonomous/status/route.ts
//
// GET -> SchedulerStatus + last 5 AgentCycleResult summaries.

import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { agentAuditLog, agentCycles, settings } from "@/db/schema";
import type { AgentCycleSummary, SchedulerStatus } from "@/lib/types";
import { DEFAULT_SCHEDULER_CONFIG } from "@/lib/agentScheduler";

export const dynamic = "force-dynamic";

async function getSettingValue(key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row?.value ?? null;
}

export async function GET() {
  const recentCycles = await db.select().from(agentCycles).orderBy(desc(agentCycles.startedAt)).limit(5);

  const priority = (await getSettingValue("agent.priority")) ?? "normal";
  const nextIntervalMsRaw = await getSettingValue("agent.next_interval_ms");
  const degradedModeRaw = await getSettingValue("agent.degraded_mode");

  const currentIntervalMs = nextIntervalMsRaw
    ? Number(nextIntervalMsRaw)
    : DEFAULT_SCHEDULER_CONFIG.normalIntervalMs;

  const lastCycle = recentCycles[0] ?? null;
  const lastRunAt = lastCycle ? new Date(lastCycle.startedAt).toISOString() : null;
  const nextRunAt = lastCycle
    ? new Date(new Date(lastCycle.startedAt).getTime() + currentIntervalMs).toISOString()
    : null;

  const errorsSince = lastCycle ? new Date(lastCycle.completedAt) : new Date(0);
  const recentErrors = await db
    .select()
    .from(agentAuditLog)
    .where(and(eq(agentAuditLog.level, "error"), gt(agentAuditLog.at, errorsSince)));

  const status: SchedulerStatus & { priority: string } = {
    running: true,
    lastRunAt,
    nextRunAt,
    currentIntervalMs,
    lastCycleId: lastCycle?.id ?? null,
    consecutiveErrors: recentErrors.length,
    degradedMode: degradedModeRaw === "true",
    priority,
  };

  const cycleSummaries: AgentCycleSummary[] = recentCycles.map((c) => ({
    cycleId: c.id,
    startedAt: new Date(c.startedAt).toISOString(),
    durationMs: new Date(c.completedAt).getTime() - new Date(c.startedAt).getTime(),
    findingsDelta: c.findingsDelta,
    playbooksTriggered: c.playbooksTriggered,
    cascadeRiskAtCompletion: c.cascadeRisk,
  }));

  return Response.json({ status, recentCycles: cycleSummaries });
}
