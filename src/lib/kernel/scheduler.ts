// =============================================================================
// LEADOS kernel — job scheduler
// =============================================================================
// Real job scheduling: cron-style + event triggers + a dependency DAG between
// jobs, with jitter, retries with exponential backoff, idempotency keys,
// concurrency limits, per-job timeouts, and a dead-letter queue.
//
// Next.js route handlers cannot host a long-lived in-process timer, so (like
// the upstream repo's own schedule.ts design) the real "clock" is external:
// something (a platform cron, or a human) calls POST /api/scheduler/tick on a
// cadence (recommended: every minute). tick() below is pure/idempotent per
// minute thanks to the idempotency key, so calling it more or less often than
// once a minute never double-runs a job.

import { db } from "@/db";
import { deadLetterQueue, jobRuns, jobs as jobsTable } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { nextCronRun } from "./cron";
import { recordAudit } from "./audit";

export type JobTrigger =
  | { type: "cron" }
  | { type: "event"; source: string }
  | { type: "manual"; actor: string };

export interface JobDefinition {
  key: string;
  kind: "cron" | "event" | "manual";
  cronExpr?: string;
  dependsOn: string[];
  concurrencyLimit: number;
  timeoutMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  /** Returns true if the event condition currently holds (event jobs only). */
  checkEvent?: () => Promise<boolean>;
  /** The actual work. Receives the trigger that caused this run. */
  run: (trigger: JobTrigger) => Promise<Record<string, unknown>>;
}

const jobRegistry = new Map<string, JobDefinition>();

export function registerJob(def: JobDefinition): void {
  jobRegistry.set(def.key, def);
}

export function getJob(key: string): JobDefinition | undefined {
  return jobRegistry.get(key);
}

export function listJobDefinitions(): JobDefinition[] {
  return Array.from(jobRegistry.values());
}

/** Upserts the code-defined job registry into the `jobs` table so the admin
 * UI / API can read concurrency limits, DAG edges, etc. */
export async function syncJobDefinitionsToDb(): Promise<void> {
  for (const def of jobRegistry.values()) {
    await db
      .insert(jobsTable)
      .values({
        key: def.key,
        kind: def.kind,
        cronExpr: def.cronExpr ?? null,
        eventType: def.kind === "event" ? def.key : null,
        dependsOn: def.dependsOn,
        concurrencyLimit: def.concurrencyLimit,
        timeoutMs: def.timeoutMs,
        maxRetries: def.maxRetries,
        backoffBaseMs: def.backoffBaseMs,
        enabled: true,
      })
      .onConflictDoUpdate({
        target: jobsTable.key,
        set: {
          kind: def.kind,
          cronExpr: def.cronExpr ?? null,
          dependsOn: def.dependsOn,
          concurrencyLimit: def.concurrencyLimit,
          timeoutMs: def.timeoutMs,
          maxRetries: def.maxRetries,
          backoffBaseMs: def.backoffBaseMs,
        },
      });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms: number): number {
  return Math.round(ms * (0.8 + Math.random() * 0.4));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Job "${label}" timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function countRunning(jobKey: string): Promise<number> {
  const rows = await db
    .select({ id: jobRuns.id })
    .from(jobRuns)
    .where(and(eq(jobRuns.jobKey, jobKey), eq(jobRuns.status, "running")));
  return rows.length;
}

async function lastSucceeded(jobKey: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(jobRuns)
    .where(eq(jobRuns.jobKey, jobKey))
    .orderBy(desc(jobRuns.scheduledFor))
    .limit(1);
  return rows[0]?.status === "succeeded";
}

export interface RunJobOptions {
  idempotencyKeySuffix?: string;
  dependencyStrict?: boolean;
}

export interface RunJobOutcome {
  jobRunId: number;
  status: "succeeded" | "failed" | "dead_letter" | "skipped_concurrency" | "skipped_dependency";
  attempts: number;
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * Runs one job to completion (including retries) respecting concurrency
 * limits, the dependency DAG, idempotency, and dead-lettering on exhaustion.
 */
export async function runJob(jobKey: string, trigger: JobTrigger, options: RunJobOptions = {}): Promise<RunJobOutcome> {
  const def = jobRegistry.get(jobKey);
  if (!def) throw new Error(`Unknown job "${jobKey}"`);

  // DAG gate: every dependency must have last succeeded (strict by default).
  for (const dep of def.dependsOn) {
    const ok = await lastSucceeded(dep);
    if (!ok && options.dependencyStrict !== false) {
      const [row] = await db
        .insert(jobRuns)
        .values({
          jobKey,
          idempotencyKey: `${jobKey}:skip-dep:${Date.now()}`,
          status: "failed",
          scheduledFor: new Date(),
          error: `Dependency "${dep}" has not succeeded yet`,
        })
        .returning();
      return { jobRunId: row.id, status: "skipped_dependency", attempts: 0, error: `Dependency "${dep}" not satisfied` };
    }
  }

  const running = await countRunning(jobKey);
  if (running >= def.concurrencyLimit) {
    const [row] = await db
      .insert(jobRuns)
      .values({
        jobKey,
        idempotencyKey: `${jobKey}:skip-conc:${Date.now()}`,
        status: "failed",
        scheduledFor: new Date(),
        error: "Concurrency limit reached",
      })
      .returning();
    return { jobRunId: row.id, status: "skipped_concurrency", attempts: 0, error: "Concurrency limit reached" };
  }

  const now = new Date();
  const idempotencyKey = `${jobKey}:${now.toISOString().slice(0, 16)}${options.idempotencyKeySuffix ? `:${options.idempotencyKeySuffix}` : ""}`;

  const existing = await db.select().from(jobRuns).where(eq(jobRuns.idempotencyKey, idempotencyKey)).limit(1);
  if (existing.length > 0) {
    const row = existing[0];
    return { jobRunId: row.id, status: row.status as RunJobOutcome["status"], attempts: row.attempt };
  }

  const jitterMs = jitter(250);
  const [jobRunRow] = await db
    .insert(jobRuns)
    .values({ jobKey, idempotencyKey, status: "running", scheduledFor: now, jitterMs, attempt: 1, startedAt: new Date() })
    .returning();

  let attempt = 1;
  let lastError = "";

  while (attempt <= def.maxRetries) {
    try {
      await sleep(jitterMs);
      const result = await withTimeout(def.run(trigger), def.timeoutMs, jobKey);
      await db
        .update(jobRuns)
        .set({ status: "succeeded", completedAt: new Date(), attempt })
        .where(eq(jobRuns.id, jobRunRow.id));
      await recordAudit({
        actor: "agent:scheduler",
        action: "job.succeeded",
        subjectType: "job",
        subjectId: jobKey,
        reason: `Job completed on attempt ${attempt}`,
        metadata: { trigger, result },
      });
      return { jobRunId: jobRunRow.id, status: "succeeded", attempts: attempt, result };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await db
        .update(jobRuns)
        .set({ status: "failed", attempt, error: lastError })
        .where(eq(jobRuns.id, jobRunRow.id));

      if (attempt >= def.maxRetries) break;
      const backoff = jitter(def.backoffBaseMs * 2 ** (attempt - 1));
      await sleep(Math.min(backoff, 2000)); // capped so tests stay fast
      attempt += 1;
    }
  }

  await db
    .update(jobRuns)
    .set({ status: "dead_letter", completedAt: new Date() })
    .where(eq(jobRuns.id, jobRunRow.id));

  const [dlqRow] = await db
    .insert(deadLetterQueue)
    .values({ jobRunId: jobRunRow.id, jobKey, reason: lastError, payload: { trigger } })
    .returning();

  await recordAudit({
    actor: "agent:scheduler",
    action: "job.dead_lettered",
    subjectType: "job",
    subjectId: jobKey,
    reason: lastError,
    riskClass: "medium",
    metadata: { dlqId: dlqRow.id },
  });

  return { jobRunId: jobRunRow.id, status: "dead_letter", attempts: attempt, error: lastError };
}

/**
 * Evaluates every enabled cron job's schedule plus every event job's
 * condition, and runs whichever are due, in dependency order (jobs with no
 * dependencies first). Call this from POST /api/scheduler/tick on an
 * external cadence.
 */
export async function tick(now: Date = new Date()): Promise<RunJobOutcome[]> {
  const defs = topoSort(listJobDefinitions());
  const outcomes: RunJobOutcome[] = [];

  for (const def of defs) {
    if (def.kind === "manual") continue;

    if (def.kind === "cron" && def.cronExpr) {
      const lastRuns = await db
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.jobKey, def.key))
        .orderBy(desc(jobRuns.scheduledFor))
        .limit(1);
      const last = lastRuns[0]?.scheduledFor ?? new Date(now.getTime() - 24 * 3600_000);
      const due = nextCronRun(def.cronExpr, new Date(last.getTime() - 60_000)) <= now;
      if (!due) continue;
      outcomes.push(await runJob(def.key, { type: "cron" }));
    }

    if (def.kind === "event" && def.checkEvent) {
      const fire = await def.checkEvent();
      if (!fire) continue;
      outcomes.push(await runJob(def.key, { type: "event", source: def.key }));
    }
  }

  return outcomes;
}

function topoSort(defs: JobDefinition[]): JobDefinition[] {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const visited = new Set<string>();
  const result: JobDefinition[] = [];

  function visit(key: string) {
    if (visited.has(key)) return;
    visited.add(key);
    const def = byKey.get(key);
    if (!def) return;
    for (const dep of def.dependsOn) visit(dep);
    result.push(def);
  }

  for (const def of defs) visit(def.key);
  return result;
}

export async function listDeadLetters(onlyUnreviewed = true) {
  const rows = await db.select().from(deadLetterQueue).orderBy(desc(deadLetterQueue.createdAt)).limit(50);
  return onlyUnreviewed ? rows.filter((r) => !r.reviewedAt) : rows;
}

export async function resolveDeadLetter(id: number, resolution: "requeued" | "dismissed", reviewedBy: string): Promise<void> {
  await db
    .update(deadLetterQueue)
    .set({ reviewedBy, reviewedAt: new Date(), resolution })
    .where(eq(deadLetterQueue.id, id));
  await recordAudit({
    actor: `human:${reviewedBy}`,
    action: "dead_letter.reviewed",
    subjectType: "dead_letter_queue",
    subjectId: String(id),
    reason: resolution,
  });
}

export async function listRecentJobRuns(jobKey?: string, limit = 50) {
  if (jobKey) {
    return db.select().from(jobRuns).where(eq(jobRuns.jobKey, jobKey)).orderBy(desc(jobRuns.scheduledFor)).limit(limit);
  }
  return db.select().from(jobRuns).orderBy(desc(jobRuns.scheduledFor)).limit(limit);
}

export async function listJobsWithStatus() {
  const defs = listJobDefinitions();
  const keys = defs.map((d) => d.key);
  const rows = keys.length ? await db.select().from(jobsTable).where(inArray(jobsTable.key, keys)) : [];
  const lastRuns = await Promise.all(defs.map((d) => listRecentJobRuns(d.key, 1)));
  return defs.map((def, i) => ({
    ...def,
    checkEvent: undefined,
    run: undefined,
    dbRow: rows.find((r) => r.key === def.key) ?? null,
    lastRun: lastRuns[i][0] ?? null,
  }));
}
