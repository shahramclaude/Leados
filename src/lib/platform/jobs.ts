// Automation API kernel: idempotent "runs" that external orchestrators can
// trigger, poll, and subscribe to (via webhooks / SSE). Re-submitting the
// same (orgId, idempotencyKey) pair returns the existing run instead of
// creating a duplicate job — this is the single job interface reused by
// every automation surface, rather than inventing a parallel one per route.
import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { emitEvent } from "./events";
import { ApiError } from "./envelope";
import { decodeCursor, encodeCursor, type CursorPage } from "./pagination";

export const RUN_TYPES = ["sync_crm", "digest_summary", "recalculate_scores"] as const;
export type RunType = (typeof RUN_TYPES)[number];

export interface TriggerRunInput {
  orgId: string;
  type: RunType;
  input: Record<string, unknown>;
  idempotencyKey?: string | null;
}

export async function triggerRun(opts: TriggerRunInput) {
  if (opts.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.orgId, opts.orgId), eq(runs.idempotencyKey, opts.idempotencyKey)))
      .limit(1);
    if (existing) return { run: existing, created: false };
  }

  const [run] = await db
    .insert(runs)
    .values({
      orgId: opts.orgId,
      type: opts.type,
      status: "queued",
      idempotencyKey: opts.idempotencyKey ?? null,
      input: opts.input,
    })
    .returning();

  await emitEvent(opts.orgId, "run.queued", { runId: run.id, type: run.type });

  // Simulate asynchronous execution. In production this would hand off to a
  // durable queue/worker; here we complete it shortly after on the same
  // process so the automation API's poll/webhook/SSE story is end-to-end
  // testable without external infra.
  void executeRun(run.id).catch((err) => console.error("run execution failed", err));

  return { run, created: true };
}

async function executeRun(runId: string) {
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) return;

  await db
    .update(runs)
    .set({
      status: "running",
      updatedAt: new Date(),
    })
    .where(eq(runs.id, runId));

  try {
    const output = { summary: `Completed ${run.type}`, processedAt: new Date().toISOString() };
    await db
      .update(runs)
      .set({ status: "completed", output, updatedAt: new Date(), completedAt: new Date() })
      .where(eq(runs.id, runId));
    await emitEvent(run.orgId, "run.completed", { runId: run.id, type: run.type, output });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(runs)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(runs.id, runId));
    await emitEvent(run.orgId, "run.failed", { runId: run.id, type: run.type, error: message });
  }
}

export async function getRun(orgId: string, id: string) {
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.orgId, orgId), eq(runs.id, id)))
    .limit(1);
  if (!run) throw new ApiError("NOT_FOUND", `Run ${id} not found`);
  return run;
}

export async function listRuns(orgId: string, opts: { limit: number; cursor?: string | null }) {
  const cursor: CursorPage | null = opts.cursor ? decodeCursor(opts.cursor) : null;

  const rows = await db
    .select()
    .from(runs)
    .where(
      cursor
        ? and(
            eq(runs.orgId, orgId),
            or(
              lt(runs.createdAt, cursor.createdAt),
              and(eq(runs.createdAt, cursor.createdAt), lt(runs.id, cursor.id)),
            ),
          )
        : eq(runs.orgId, orgId),
    )
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const page = rows.slice(0, opts.limit);
  const nextCursor = hasMore ? encodeCursor({ createdAt: page[page.length - 1].createdAt, id: page[page.length - 1].id }) : null;

  return { items: page, nextCursor };
}
