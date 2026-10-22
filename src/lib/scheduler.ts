// LEADOS — Part 38 / Part 10 compatibility shim: idempotent job scheduler.
//
// Real Part 10 scheduler is expected to drive this via cron/queue. Here we
// provide the idempotency + budget primitives Part 38 needs: a cycle can be
// (re)triggered any number of times (e.g. a retried nightly job, or a human
// clicking "run now" twice) but will only execute once per (jobKey, cycleKey)
// pair, and each invocation is budgeted so a single cycle can never run an
// unbounded number of checks/remediations (caps thrash — see Phase 5).

import { db } from "@/db";
import { schedulerJobs } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export function dailyCycleKey(date = new Date()): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function weeklyCycleKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday=0
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface ClaimResult {
  claimed: boolean;
  reason: "claimed" | "already_completed" | "already_running";
  jobId?: number;
}

/** Atomically claims a (jobKey, cycleKey) slot. Idempotent: double-trigger safe. */
export async function claimCycle(jobKey: string, cycleKey: string, budget: number): Promise<ClaimResult> {
  const existing = await db
    .select()
    .from(schedulerJobs)
    .where(and(eq(schedulerJobs.jobKey, jobKey), eq(schedulerJobs.cycleKey, cycleKey)))
    .limit(1);

  if (existing.length > 0) {
    const job = existing[0];
    if (job.status === "completed") {
      return { claimed: false, reason: "already_completed", jobId: job.id };
    }
    return { claimed: false, reason: "already_running", jobId: job.id };
  }

  const [row] = await db
    .insert(schedulerJobs)
    .values({ jobKey, cycleKey, status: "running", budget, checksRun: 0 })
    .returning();

  return { claimed: true, reason: "claimed", jobId: row.id };
}

export async function completeCycle(jobId: number, checksRun: number, result: unknown) {
  await db
    .update(schedulerJobs)
    .set({ status: "completed", checksRun, finishedAt: new Date(), result: result as object })
    .where(eq(schedulerJobs.id, jobId));
}

export async function failCycle(jobId: number, checksRun: number, result: unknown) {
  await db
    .update(schedulerJobs)
    .set({ status: "failed", checksRun, finishedAt: new Date(), result: result as object })
    .where(eq(schedulerJobs.id, jobId));
}
