// Outbound webhooks: HMAC-signed delivery with exponential backoff retries
// and a dead-letter state after the attempt budget is exhausted.
import { createHmac } from "node:crypto";
import { and, eq, lte, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries, webhookSubscriptions } from "@/db/schema";

// Backoff schedule in seconds for attempts 1..6 (first attempt is immediate).
const BACKOFF_SCHEDULE_SECONDS = [30, 120, 600, 1800, 3600, 21600];
const MAX_ATTEMPTS = BACKOFF_SCHEDULE_SECONDS.length;
const DELIVERY_TIMEOUT_MS = 8000;

export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export interface PlatformEventRow {
  id: string;
  orgId: string;
  type: string;
  payload: unknown;
  createdAt: Date;
}

/** Enqueue a delivery attempt for every active subscription matching this event type. */
export async function dispatchEventToWebhooks(event: PlatformEventRow) {
  const subs = await db
    .select()
    .from(webhookSubscriptions)
    .where(and(eq(webhookSubscriptions.orgId, event.orgId), eq(webhookSubscriptions.active, true)));

  const matching = subs.filter(
    (sub) => sub.eventTypes.includes(event.type) || sub.eventTypes.includes("*"),
  );

  for (const sub of matching) {
    const [delivery] = await db
      .insert(webhookDeliveries)
      .values({
        subscriptionId: sub.id,
        orgId: event.orgId,
        eventType: event.type,
        eventId: event.id,
        payload: { id: event.id, type: event.type, orgId: event.orgId, createdAt: event.createdAt, data: event.payload },
        status: "pending",
        attempt: 0,
        maxAttempts: MAX_ATTEMPTS,
      })
      .returning();

    void attemptDelivery(delivery.id).catch((err) => console.error("webhook attempt failed", err));
  }
}

async function attemptDelivery(deliveryId: string) {
  const [delivery] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).limit(1);
  if (!delivery) return;
  const [sub] = await db
    .select()
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.id, delivery.subscriptionId))
    .limit(1);
  if (!sub || !sub.active) return;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawBody = JSON.stringify(delivery.payload);
  const signature = signPayload(sub.secret, timestamp, rawBody);
  const attempt = delivery.attempt + 1;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    const res = await fetch(sub.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Leados-Event": delivery.eventType,
        "X-Leados-Delivery": delivery.id,
        "X-Leados-Timestamp": timestamp,
        "X-Leados-Signature": `sha256=${signature}`,
      },
      body: rawBody,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const bodyText = await res.text().catch(() => "");

    if (res.ok) {
      await db
        .update(webhookDeliveries)
        .set({
          status: "delivered",
          attempt,
          responseStatus: res.status,
          responseBody: bodyText.slice(0, 2000),
          deliveredAt: new Date(),
          nextRetryAt: null,
        })
        .where(eq(webhookDeliveries.id, deliveryId));
      return;
    }

    await scheduleRetryOrDeadLetter(deliveryId, attempt, res.status, bodyText);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown delivery error";
    await scheduleRetryOrDeadLetter(deliveryId, attempt, null, message);
  }
}

async function scheduleRetryOrDeadLetter(
  deliveryId: string,
  attempt: number,
  responseStatus: number | null,
  responseBody: string,
) {
  if (attempt >= MAX_ATTEMPTS) {
    await db
      .update(webhookDeliveries)
      .set({ status: "dead_letter", attempt, responseStatus, responseBody: responseBody.slice(0, 2000), nextRetryAt: null })
      .where(eq(webhookDeliveries.id, deliveryId));
    return;
  }

  const delaySeconds = BACKOFF_SCHEDULE_SECONDS[attempt - 1] ?? BACKOFF_SCHEDULE_SECONDS[MAX_ATTEMPTS - 1];
  const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);
  await db
    .update(webhookDeliveries)
    .set({ status: "retrying", attempt, responseStatus, responseBody: responseBody.slice(0, 2000), nextRetryAt })
    .where(eq(webhookDeliveries.id, deliveryId));
}

/** Process every delivery whose retry time has arrived. Safe to call repeatedly (cron or interval). */
export async function processDueRetries(limit = 25) {
  const due = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, "retrying"),
        or(isNull(webhookDeliveries.nextRetryAt), lte(webhookDeliveries.nextRetryAt, new Date())),
      ),
    )
    .limit(limit);

  for (const delivery of due) {
    await attemptDelivery(delivery.id);
  }
  return due.length;
}

/** Manually force a retry regardless of backoff schedule (used by the delivery log UI / API). */
export async function retryDeliveryNow(deliveryId: string) {
  await attemptDelivery(deliveryId);
}
