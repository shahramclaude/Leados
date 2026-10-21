// Part 07 stand-in: job scheduler. No prior-part scheduler file existed in the
// sandbox checkout, so this implements (a) a job registry + runner usable from
// an API route or a process-level interval, and (b) a log of every run in
// `job_runs` so "ran unattended" is auditable rather than asserted.
//
// HONEST LIMITATION: this sandbox has no durable always-on worker process
// guaranteed across deploys. `src/instrumentation.ts` starts best-effort
// in-process intervals as a dev-mode convenience. For a real production
// deployment, wire the platform's cron (or Part 07's dedicated scheduler
// service) to call `POST /api/jobs/run?job=<name>` on the cadence below —
// the job *logic* here is what actually runs either way.
import { db } from "@/db";
import { jobRuns } from "@/db/schema";

export type JobName =
  | "weekly-board-pack"
  | "daily-early-warning-scan"
  | "monthly-delivery-recalibration"
  | "decision-retrospective-sweep";

export const JOB_CADENCE: Record<JobName, string> = {
  "weekly-board-pack": "weekly (Mondays 07:00)",
  "daily-early-warning-scan": "daily (06:00)",
  "monthly-delivery-recalibration": "monthly (1st, 05:00)",
  "decision-retrospective-sweep": "daily (any decision past review date)",
};

export async function runJob(name: JobName, fn: () => Promise<unknown>) {
  try {
    const detail = await fn();
    await db.insert(jobRuns).values({ jobName: name, status: "ok", detail: (detail ?? {}) as object });
    return { ok: true, detail };
  } catch (err) {
    const detail = { error: err instanceof Error ? err.message : String(err) };
    await db.insert(jobRuns).values({ jobName: name, status: "error", detail });
    return { ok: false, detail };
  }
}

export async function recentJobRuns(limit = 20) {
  const rows = await db.select().from(jobRuns).orderBy(jobRuns.runAt).limit(limit);
  return rows.reverse();
}
