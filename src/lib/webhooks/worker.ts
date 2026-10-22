import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries, webhookEvents, webhookSubscriptions } from "@/db/schema";
import { buildSignatureHeader, WEBHOOK_ID_HEADER, WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TIMESTAMP_HEADER } from "../api/hmac";
import { eventBus } from "../events/bus";
import type { z } from "zod";
import type { WebhookEventTypeEnum } from "../api/schemas";

export type WebhookEventType = z.infer<typeof WebhookEventTypeEnum>;

/** Backoff schedule in ms: attempt 1 -> 1s, 2 -> 5s, 3 -> 30s, 4 -> 2m, 5+ -> dead-letter. */
const BACKOFF_MS = [1_000, 5_000, 30_000, 120_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

/** Overridable in tests to make retry schedules fast and deterministic. */
export function backoffFor(attempt: number): number {
  const scale = Number(process.env.WEBHOOK_BACKOFF_SCALE ?? 1);
  return (BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[BACKOFF_MS.length - 1]) * scale;
}

/** Redacts a delivery payload for the delivery-log UI/API: keeps shape, masks string leaf values. */
export function redactPayload(payload: unknown): Record<string, unknown> {
  function redact(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(redact);
    if (typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redact(v)]));
    }
    if (typeof value === "string") {
      if (value.length <= 4) return "****";
      return `${value.slice(0, 2)}***${value.slice(-2)}`;
    }
    if (typeof value === "number" || typeof value === "boolean") return value;
    return "***";
  }
  return redact(payload) as Record<string, unknown>;
}

/**
 * Durable fan-out: records the event once, then creates one delivery row per
 * matching, active subscription. Each delivery is attempted immediately and
 * otherwise picked up by `processDueDeliveries` (retry worker tick).
 */
export async function emitEvent(type: WebhookEventType, payload: Record<string, unknown>) {
  const [event] = await db.insert(webhookEvents).values({ type, payload }).returning();
  eventBus.publish({ id: event.id, type, data: payload, ts: event.createdAt.toISOString() });

  const subs = await db
    .select()
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.status, "active"));

  const matching = subs.filter((s) => (s.eventTypes as string[]).includes(type));

  const deliveries = [];
  for (const sub of matching) {
    const [delivery] = await db
      .insert(webhookDeliveries)
      .values({
        subscriptionId: sub.id,
        eventId: event.id,
        eventType: type,
        payload,
        status: "pending",
        attempt: 0,
        maxAttempts: MAX_ATTEMPTS,
        nextAttemptAt: new Date(),
      })
      .returning();
    deliveries.push(delivery);
  }

  // Best-effort immediate attempt for each new delivery (does not block on retry scheduling).
  await Promise.all(deliveries.map((d) => attemptDelivery(d.id)));
  return { event, deliveryIds: deliveries.map((d) => d.id) };
}

/** Attempts a single delivery now, regardless of nextAttemptAt (used for immediate send + test-fire). */
export async function attemptDelivery(deliveryId: string): Promise<void> {
  const [delivery] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).limit(1);
  if (!delivery || delivery.status === "success" || delivery.status === "dead_letter") return;

  const [sub] = await db
    .select()
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.id, delivery.subscriptionId))
    .limit(1);
  if (!sub || sub.status !== "active") return;

  const attempt = delivery.attempt + 1;
  const rawBody = JSON.stringify({
    id: delivery.id,
    type: delivery.eventType,
    data: delivery.payload,
    attempt,
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildSignatureHeader(sub.secret, timestamp, rawBody);

  try {
    const res = await fetch(sub.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WEBHOOK_SIGNATURE_HEADER]: signature,
        [WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
        [WEBHOOK_ID_HEADER]: delivery.id,
      },
      body: rawBody,
    });

    if (res.ok) {
      await db
        .update(webhookDeliveries)
        .set({
          status: "success",
          attempt,
          lastStatusCode: res.status,
          lastError: null,
          deliveredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
      return;
    }
    await scheduleRetryOrDeadLetter(delivery.id, attempt, `non-2xx response: ${res.status}`, res.status);
  } catch (err) {
    await scheduleRetryOrDeadLetter(
      delivery.id,
      attempt,
      err instanceof Error ? err.message : "unknown delivery error",
      null,
    );
  }
}

async function scheduleRetryOrDeadLetter(
  deliveryId: string,
  attempt: number,
  error: string,
  statusCode: number | null,
) {
  if (attempt >= MAX_ATTEMPTS) {
    await db
      .update(webhookDeliveries)
      .set({ status: "dead_letter", attempt, lastError: error, lastStatusCode: statusCode, updatedAt: new Date() })
      .where(eq(webhookDeliveries.id, deliveryId));
    return;
  }
  const delayMs = backoffFor(attempt);
  await db
    .update(webhookDeliveries)
    .set({
      status: "retrying",
      attempt,
      lastError: error,
      lastStatusCode: statusCode,
      nextAttemptAt: new Date(Date.now() + delayMs),
      updatedAt: new Date(),
    })
    .where(eq(webhookDeliveries.id, deliveryId));
}

/** Processes all deliveries that are due now. This is what a cron/worker tick (or the admin endpoint) calls. */
export async function processDueDeliveries(limit = 50): Promise<number> {
  const due = await db
    .select()
    .from(webhookDeliveries)
    .where(and(inArray(webhookDeliveries.status, ["pending", "retrying"]), lte(webhookDeliveries.nextAttemptAt, new Date())))
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(limit);

  for (const d of due) {
    await attemptDelivery(d.id);
  }
  return due.length;
}
