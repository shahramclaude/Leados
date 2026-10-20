// Append-only platform event log. Every domain mutation that matters to an
// external integrator (decision created, run completed, finding raised...)
// is recorded here. It is the single source of truth consumed by both:
//  - the realtime SSE API (`/api/v1/events/stream`), via `seq` as the cursor
//  - the webhook dispatcher, which fans events out to active subscriptions
import { asc, eq, gt, and } from "drizzle-orm";
import { db } from "@/db";
import { platformEvents } from "@/db/schema";
import { dispatchEventToWebhooks } from "./webhooks";

export type PlatformEventType =
  | "decision.created"
  | "decision.updated"
  | "finding.created"
  | "run.queued"
  | "run.completed"
  | "run.failed"
  | "webhook.test";

export async function emitEvent(orgId: string, type: PlatformEventType, payload: unknown) {
  const [row] = await db
    .insert(platformEvents)
    .values({ orgId, type, payload: payload as object })
    .returning();

  // Fire-and-forget fan-out to webhook subscriptions. Failures are captured
  // in the delivery log (with retry/backoff), never thrown back at the
  // caller that triggered the domain event.
  void dispatchEventToWebhooks(row).catch((err: unknown) => {
    console.error("webhook dispatch failed to enqueue", err);
  });

  return row;
}

export async function listEventsSince(orgId: string, afterSeq: number, limit: number) {
  return db
    .select()
    .from(platformEvents)
    .where(and(eq(platformEvents.orgId, orgId), gt(platformEvents.seq, afterSeq)))
    .orderBy(asc(platformEvents.seq))
    .limit(limit);
}
