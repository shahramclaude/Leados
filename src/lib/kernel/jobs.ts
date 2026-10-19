// =============================================================================
// LEADOS kernel — concrete job definitions (the 5 required triggers)
// =============================================================================
// 1. new severity-5 finding  -> event job "severity5-finding-watch"
// 2. metric anomaly          -> event job "metric-anomaly-watch"
// 3. deadline approaching    -> event job "deadline-approaching-watch"
// 4. weekly cadence          -> cron job  "monday-briefing" (Mon 08:00 UTC)
// 5. manual run              -> manual job "manual-cycle" (POST /api/autonomous/run)

import { db } from "@/db";
import { findings, jobRuns, metricReadings, workItems } from "@/db/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { registerJob } from "./scheduler";
import { runCycle } from "./orchestrator";
import { checkSlaBreaches } from "./workQueue";
import { generateAndStoreBriefing } from "./briefing";

async function lastSucceededAt(jobKey: string): Promise<Date> {
  const rows = await db
    .select()
    .from(jobRuns)
    .where(and(eq(jobRuns.jobKey, jobKey), eq(jobRuns.status, "succeeded")))
    .orderBy(desc(jobRuns.completedAt))
    .limit(1);
  return rows[0]?.completedAt ?? new Date(0);
}

let registered = false;

export function ensureJobsRegistered(): void {
  if (registered) return;

  registerJob({
    key: "severity5-finding-watch",
    kind: "event",
    dependsOn: [],
    concurrencyLimit: 1,
    timeoutMs: 15_000,
    maxRetries: 3,
    backoffBaseMs: 500,
    checkEvent: async () => {
      const watermark = await lastSucceededAt("severity5-finding-watch");
      const rows = await db
        .select({ id: findings.id })
        .from(findings)
        .where(and(eq(findings.status, "open"), eq(findings.severity, 5), gte(findings.createdAt, watermark)))
        .limit(1);
      return rows.length > 0;
    },
    run: async () => {
      const result = await runCycle({ trigger: { type: "event", source: "severity5_finding" } });
      return { ...result };
    },
  });

  registerJob({
    key: "metric-anomaly-watch",
    kind: "event",
    dependsOn: [],
    concurrencyLimit: 1,
    timeoutMs: 15_000,
    maxRetries: 3,
    backoffBaseMs: 500,
    checkEvent: async () => {
      const watermark = await lastSucceededAt("metric-anomaly-watch");
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000);
      const rows = await db.select().from(metricReadings).where(gte(metricReadings.observedAt, sevenDaysAgo)).orderBy(metricReadings.observedAt);
      const byKey = new Map<string, number[]>();
      for (const r of rows) {
        if (r.observedAt < watermark) continue;
        const list = byKey.get(r.key) ?? [];
        list.push(r.value);
        byKey.set(r.key, list);
      }
      for (const [key] of byKey) {
        const allForKey = rows.filter((r) => r.key === key).map((r) => r.value);
        if (allForKey.length < 5) continue;
        const mean = allForKey.reduce((a, b) => a + b, 0) / allForKey.length;
        const variance = allForKey.reduce((a, b) => a + (b - mean) ** 2, 0) / allForKey.length;
        const stdev = Math.sqrt(variance) || 1;
        const latest = allForKey[allForKey.length - 1];
        const z = Math.abs((latest - mean) / stdev);
        if (z > 2.5) return true;
      }
      return false;
    },
    run: async () => {
      const result = await runCycle({ trigger: { type: "event", source: "metric_anomaly" } });
      return { ...result };
    },
  });

  registerJob({
    key: "deadline-approaching-watch",
    kind: "event",
    dependsOn: [],
    concurrencyLimit: 1,
    timeoutMs: 15_000,
    maxRetries: 3,
    backoffBaseMs: 500,
    checkEvent: async () => {
      const soon = new Date(Date.now() + 2 * 3600_000);
      const rows = await db
        .select({ id: workItems.id })
        .from(workItems)
        .where(and(gte(workItems.slaDueAt, new Date()), lte(workItems.slaDueAt, soon)))
        .limit(1);
      return rows.length > 0;
    },
    run: async () => {
      const escalated = await checkSlaBreaches();
      const cycle = await runCycle({ trigger: { type: "event", source: "deadline_approaching" } });
      return { escalated, cycle };
    },
  });

  registerJob({
    key: "monday-briefing",
    kind: "cron",
    cronExpr: "0 8 * * 1",
    dependsOn: [],
    concurrencyLimit: 1,
    timeoutMs: 15_000,
    maxRetries: 2,
    backoffBaseMs: 1000,
    run: async () => {
      const briefing = await generateAndStoreBriefing();
      return { briefingId: briefing.id };
    },
  });

  registerJob({
    key: "manual-cycle",
    kind: "manual",
    dependsOn: [],
    concurrencyLimit: 3,
    timeoutMs: 15_000,
    maxRetries: 1,
    backoffBaseMs: 500,
    run: async (trigger) => {
      const source = trigger.type === "manual" ? trigger.actor : "manual";
      const result = await runCycle({ trigger: { type: "manual", source } });
      return { ...result };
    },
  });

  registered = true;
}
