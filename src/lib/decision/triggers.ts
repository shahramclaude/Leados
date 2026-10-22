// =============================================================================
// LEADOS — Part 23 — Trigger-based review (Part 13 sensing STUB SEAM)
// =============================================================================
// STUB SEAM: Part 13 ("sensing") was not present in this sandbox. Real-world
// sensing would push signal readings onto an event bus that this module
// subscribes to. Until Part 13 ships, `ingestSignalReading` is the manual seam
// (also exposed at POST /api/decisions/signals) that lets us prove the
// trigger -> auto-opened-review-task path end-to-end today.
//
// This is explicitly flagged and ledgered: every time this module evaluates
// triggers for an org, if no real sensing integration is configured it writes
// an `event_log` row of type `system.stub_seam.part13_sensing_absent` the
// first time per process, so the gap is visible in the audit trail rather than
// silently assumed away.
// =============================================================================

import { db } from "@/db";
import {
  decisionTriggerWatches,
  decisions,
  sensorSignalReadings,
  reviewTasks,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { appendEvent } from "./eventLog";

let stubSeamLedgered = false;

async function ledgerStubSeamOnce(orgId: string) {
  if (stubSeamLedgered) return;
  stubSeamLedgered = true;
  await appendEvent({
    orgId,
    entityType: "system",
    type: "system.stub_seam.part13_sensing_absent",
    payload: {
      note:
        "Part 13 (sensing) is not present in this build. Decision triggers are evaluated against manually-ingested sensorSignalReadings via POST /api/decisions/signals. Replace with Part 13's event bus subscription when available.",
    },
  });
}

export interface IngestSignalInput {
  orgId: string;
  signal: string;
  value: number;
  observedAt?: Date;
}

export async function ingestSignalReading(input: IngestSignalInput) {
  const [row] = await db
    .insert(sensorSignalReadings)
    .values({
      orgId: input.orgId,
      signal: input.signal,
      value: String(input.value),
      observedAt: input.observedAt ?? new Date(),
    })
    .returning();
  return row;
}

async function latestValueFor(orgId: string, signal: string): Promise<number | null> {
  const [row] = await db
    .select()
    .from(sensorSignalReadings)
    .where(and(eq(sensorSignalReadings.orgId, orgId), eq(sensorSignalReadings.signal, signal)))
    .orderBy(desc(sensorSignalReadings.observedAt))
    .limit(1);
  return row ? Number(row.value) : null;
}

function isBreached(op: string, value: number, threshold: number): boolean {
  switch (op) {
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
    case "eq":
      return value === threshold;
    default:
      return false;
  }
}

export interface TriggerEvaluationResult {
  decisionId: string;
  watchId: string;
  signal: string;
  breached: boolean;
  value: number | null;
  reviewTaskId?: string;
}

/** Evaluates all watches for an org against the latest signal readings. For
 * any newly-breached watch on an already-decided (committed) decision, this
 * opens a review task automatically — reviews on reality, not only calendar. */
export async function evaluateTriggersForOrg(orgId: string): Promise<TriggerEvaluationResult[]> {
  await ledgerStubSeamOnce(orgId);

  const watches = await db
    .select({
      watch: decisionTriggerWatches,
      decision: decisions,
    })
    .from(decisionTriggerWatches)
    .innerJoin(decisions, eq(decisionTriggerWatches.decisionId, decisions.id))
    .where(and(eq(decisions.orgId, orgId), eq(decisionTriggerWatches.status, "watching")));

  const results: TriggerEvaluationResult[] = [];

  for (const { watch, decision } of watches) {
    const value = await latestValueFor(orgId, watch.signal);
    const threshold = Number(watch.thresholdValue);
    const breached = value !== null && isBreached(watch.thresholdOp, value, threshold);

    await db
      .update(decisionTriggerWatches)
      .set({
        lastValue: value === null ? null : String(value),
        lastEvaluatedAt: new Date(),
        status: breached ? "breached" : "watching",
        breachedAt: breached ? new Date() : null,
      })
      .where(eq(decisionTriggerWatches.id, watch.id));

    let reviewTaskId: string | undefined;

    if (breached) {
      await appendEvent({
        orgId,
        entityType: "decision",
        entityId: decision.id,
        type: "decision.trigger_breached",
        payload: { signal: watch.signal, value, threshold: watch.thresholdValue, op: watch.thresholdOp },
      });

      if (decision.status === "decided" && decision.committedAt) {
        const [task] = await db
          .insert(reviewTasks)
          .values({
            orgId,
            decisionId: decision.id,
            title: `Review decision: "${decision.question}" — trigger "${watch.signal}" breached`,
            status: "open",
            dueAt: new Date(),
            source: "trigger_breach",
          })
          .returning();
        reviewTaskId = task.id;

        await appendEvent({
          orgId,
          entityType: "decision",
          entityId: decision.id,
          type: "decision.review_task_opened",
          payload: { reviewTaskId: task.id, reason: "trigger_breach", signal: watch.signal },
        });
      }
    }

    results.push({ decisionId: decision.id, watchId: watch.id, signal: watch.signal, breached, value, reviewTaskId });
  }

  return results;
}

export async function listReviewTasks(orgId: string) {
  return db.select().from(reviewTasks).where(eq(reviewTasks.orgId, orgId)).orderBy(desc(reviewTasks.createdAt));
}
