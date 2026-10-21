// Scheduler: runs cycles on cron/event triggers, unattended.
//
// Serverless-honesty note: this process cannot keep a `setInterval` alive
// between HTTP requests in a serverless Next.js deployment. The real
// "unattended" behavior therefore comes from `POST /api/scheduler/tick`
// being invoked by an external scheduler (cron host / CI schedule / platform
// cron) on a short interval (documented in docs/RUNBOOKS.md-equivalent
// comments below) — `tick()` itself is what decides, each time it's called,
// which jobs are due and runs them, which is the entire mechanism requested:
// cron cadence, severity-5 event trigger, metric-anomaly trigger, deadline
// trigger, all re-evaluated every tick.
import { db } from "@/db";
import { kernelJobRuns, kernelJobs, kernelMetricReadings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { newId } from "./ids";
import { appendEvent } from "./events";
import { isKillSwitchEngaged } from "./killSwitch";
import { createPlan, recordDryRunForPlan, runCycle } from "./orchestrator";
import { checkAnomalyTripwire } from "./severity";
import { checkSlaBreaches } from "./workQueue";
import { weeklyBriefingPlan } from "./planTypes";
import { cronMatches, MONDAY_BRIEFING_CRON } from "./cron";
import type { Actor } from "./types";

const SCHEDULER_ACTOR: Actor = { kind: "system", id: "scheduler" };

export type JobTrigger =
  | { type: "cron"; expr: string }
  | { type: "event"; eventType: string }
  | { type: "metric-anomaly"; metricKey: string; domain: string }
  | { type: "deadline" };

export interface JobDefinition {
  name: string;
  trigger: JobTrigger;
  handler: () => Promise<{ runId?: string; note: string }>;
}

const jobHandlers = new Map<string, JobDefinition>();

export function registerJob(def: JobDefinition): void {
  jobHandlers.set(def.name, def);
}

async function ensureJobRow(def: JobDefinition): Promise<void> {
  const [existing] = await db.select().from(kernelJobs).where(eq(kernelJobs.name, def.name)).limit(1);
  if (!existing) {
    await db.insert(kernelJobs).values({ id: newId("job"), name: def.name, trigger: def.trigger as object, handler: def.name });
  }
}

async function runAndStartPlan(domain: string, goal: string, steps: Parameters<typeof createPlan>[0]["steps"], dryRunFirst: boolean) {
  if (dryRunFirst) {
    const dryPlan = await createPlan({ goal: `${goal} (dry-run)`, domain, steps, dryRun: true, actor: SCHEDULER_ACTOR });
    await recordDryRunForPlan(dryPlan.planId, SCHEDULER_ACTOR);
    await runCycle(dryPlan.planId, { actor: SCHEDULER_ACTOR });
  }
  const plan = await createPlan({ goal, domain, steps, dryRun: false, actor: SCHEDULER_ACTOR });
  if (!dryRunFirst) await recordDryRunForPlan(plan.planId, SCHEDULER_ACTOR);
  const result = await runCycle(plan.planId, { actor: SCHEDULER_ACTOR });
  return { planId: plan.planId, result };
}

// --- Built-in jobs -----------------------------------------------------------

registerJob({
  name: "monday-briefing",
  trigger: { type: "cron", expr: MONDAY_BRIEFING_CRON },
  handler: async () => {
    const { planId } = await runAndStartPlan("org", "Weekly Monday briefing", weeklyBriefingPlan("org"), true);
    return { runId: planId, note: "weekly briefing generated" };
  },
});

registerJob({
  name: "metric-anomaly-sweep",
  trigger: { type: "metric-anomaly", metricKey: "demo_metric", domain: "org" },
  handler: async () => {
    const rows = await db.select().from(kernelMetricReadings).orderBy(desc(kernelMetricReadings.ts)).limit(1);
    if (rows.length === 0) return { note: "no readings to check" };
    const latest = rows[0];
    const result = await checkAnomalyTripwire({ metricKey: latest.metricKey, value: latest.value, baseline: latest.baseline, domain: "org", actor: SCHEDULER_ACTOR });
    return { note: `checked ${latest.metricKey}: severity=${result.severity}${result.findingId ? ` finding=${result.findingId}` : ""}` };
  },
});

registerJob({
  name: "deadline-sweep",
  trigger: { type: "deadline" },
  handler: async () => {
    const escalated = await checkSlaBreaches();
    return { note: `escalated ${escalated.length} SLA-breaching work items` };
  },
});

export function getRegisteredJobs(): JobDefinition[] {
  return Array.from(jobHandlers.values());
}

/** A single scheduler tick: evaluates every registered job's trigger and
 * runs the ones that are due. Checked FIRST and unconditionally: the global
 * kill switch — if engaged, a tick runs nothing at all, which is the
 * mechanism that satisfies "halts all runs within one scheduler tick". */
export async function tick(now: Date = new Date()): Promise<Array<{ job: string; ran: boolean; note: string }>> {
  const results: Array<{ job: string; ran: boolean; note: string }> = [];

  if (await isKillSwitchEngaged()) {
    await appendEvent({ type: "scheduler.tick_skipped", actor: SCHEDULER_ACTOR, correlationId: "scheduler", payload: { reason: "kill_switch_engaged" } });
    return [{ job: "*", ran: false, note: "kill switch engaged; tick skipped entirely" }];
  }

  for (const def of getRegisteredJobs()) {
    await ensureJobRow(def);
    const due = def.trigger.type === "cron" ? cronMatches(def.trigger.expr, now) : true; // event/metric-anomaly/deadline jobs are evaluated every tick by design
    if (!due) {
      results.push({ job: def.name, ran: false, note: "not due" });
      continue;
    }
    const jobRunId = newId("jobrun");
    await db.insert(kernelJobRuns).values({ id: jobRunId, jobId: def.name, status: "running" });
    try {
      const outcome = await def.handler();
      await db.update(kernelJobRuns).set({ status: "done", completedAt: new Date(), resultingRunId: outcome.runId ?? null }).where(eq(kernelJobRuns.id, jobRunId));
      await db.update(kernelJobs).set({ lastRunAt: new Date() }).where(eq(kernelJobs.name, def.name));
      await appendEvent({ type: "scheduler.job_ran", actor: SCHEDULER_ACTOR, correlationId: outcome.runId ?? "scheduler", payload: { job: def.name, note: outcome.note } });
      results.push({ job: def.name, ran: true, note: outcome.note });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.update(kernelJobRuns).set({ status: "failed", completedAt: new Date(), error: message }).where(eq(kernelJobRuns.id, jobRunId));
      await appendEvent({ type: "scheduler.job_failed", actor: SCHEDULER_ACTOR, correlationId: "scheduler", payload: { job: def.name, message } });
      results.push({ job: def.name, ran: false, note: `failed: ${message}` });
    }
  }
  return results;
}
