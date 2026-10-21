import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries, webhookSubscriptions } from "@/db/schema";
import { assertCapability } from "./capability";
import { publishToStream } from "./stream";

export const REPLAY_WINDOW_SECONDS = 5 * 60;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

/**
 * Builds the `LEADOS-Signature` header value: `t=<unix_ts>,v1=<hmac>`.
 * The HMAC covers `${timestamp}.${rawBody}` so a captured payload cannot be
 * replayed under a new timestamp without also forging a new signature, and a
 * signature cannot be reused against a different payload.
 */
export function signWebhookPayload(secret: string, timestamp: number, rawBody: string): string {
  const hmac = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${hmac}`;
}

export interface VerifyResult {
  valid: boolean;
  reason?: "MALFORMED" | "BAD_SIGNATURE" | "REPLAY";
}

/** Verifies an inbound signature header against a shared secret, including replay protection. */
export function verifyWebhookSignature(
  secret: string,
  header: string | null,
  rawBody: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  replayWindowSeconds: number = REPLAY_WINDOW_SECONDS,
): VerifyResult {
  if (!header) return { valid: false, reason: "MALFORMED" };
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, v];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return { valid: false, reason: "MALFORMED" };

  if (Math.abs(nowSeconds - t) > replayWindowSeconds) {
    return { valid: false, reason: "REPLAY" };
  }

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(v1, "hex");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, reason: "BAD_SIGNATURE" };
  }
  return { valid: true };
}

// Exponential backoff schedule in seconds for attempts 1..6; attempt 7 -> dead_letter.
export const BACKOFF_SCHEDULE_SECONDS = [30, 120, 600, 1800, 7200, 21600];
export const MAX_ATTEMPTS = BACKOFF_SCHEDULE_SECONDS.length;

export async function enqueueDeliveriesForEvent(orgId: string, eventType: string, eventId: string, payload: unknown) {
  assertCapability(orgId, "webhook.deliver");
  const subs = await db
    .select()
    .from(webhookSubscriptions)
    .where(and(eq(webhookSubscriptions.orgId, orgId), eq(webhookSubscriptions.active, true)));

  const matching = subs.filter((s) => s.eventTypes.includes(eventType) || s.eventTypes.includes("*"));
  for (const sub of matching) {
    await db.insert(webhookDeliveries).values({
      subscriptionId: sub.id,
      eventId,
      eventType,
      payload: payload as object,
      status: "pending",
      attempt: 0,
      maxAttempts: MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    });
  }
  return matching.length;
}

/** Attempts a single delivery over HTTP, applying backoff / dead-letter on failure. */
export async function attemptDelivery(deliveryId: string) {
  const [delivery] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).limit(1);
  if (!delivery) return null;
  const [sub] = await db
    .select()
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.id, delivery.subscriptionId))
    .limit(1);
  if (!sub) return null;

  const rawBody = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(sub.secret, timestamp, rawBody);
  const attempt = delivery.attempt + 1;

  let responseStatus: number | null = null;
  let responseSnippet: string | null = null;
  let errorMessage: string | null = null;
  let success = false;

  try {
    const res = await fetch(sub.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "LEADOS-Signature": signature,
        "LEADOS-Event": delivery.eventType,
        "LEADOS-Delivery-Id": delivery.id,
      },
      body: rawBody,
      signal: AbortSignal.timeout(10_000),
    });
    responseStatus = res.status;
    const text = await res.text().catch(() => "");
    responseSnippet = text.slice(0, 500);
    success = res.status >= 200 && res.status < 300;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "network error";
  }

  if (success) {
    await db
      .update(webhookDeliveries)
      .set({
        status: "success",
        attempt,
        lastAttemptAt: new Date(),
        deliveredAt: new Date(),
        responseStatus,
        responseBodySnippet: redact(responseSnippet),
        errorMessage: null,
      })
      .where(eq(webhookDeliveries.id, delivery.id));
    return { success: true, attempt };
  }

  const isDead = attempt >= delivery.maxAttempts;
  const backoffSeconds = BACKOFF_SCHEDULE_SECONDS[Math.min(attempt - 1, BACKOFF_SCHEDULE_SECONDS.length - 1)];
  await db
    .update(webhookDeliveries)
    .set({
      status: isDead ? "dead_letter" : "pending",
      attempt,
      lastAttemptAt: new Date(),
      nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000),
      responseStatus,
      responseBodySnippet: redact(responseSnippet),
      errorMessage,
    })
    .where(eq(webhookDeliveries.id, delivery.id));
  return { success: false, attempt, deadLettered: isDead };
}

/** Processes all deliveries whose `nextAttemptAt` has elapsed. Called by the worker route (cron-triggered). */
export async function processDueDeliveries(limit = 25) {
  const due = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, new Date())))
    .limit(limit);
  const results = [];
  for (const d of due) {
    results.push(await attemptDelivery(d.id));
  }
  return { processed: due.length, results };
}

// Delivery-log payloads are redacted for any field that looks like a secret
// before being shown through the API, per data handling policy.
const SECRET_KEY_PATTERN = /(secret|token|authorization|password|api[-_]?key)/i;
export function redact(value: string | null): string | null {
  if (!value) return value;
  try {
    const parsed = JSON.parse(value);
    const scrub = (obj: unknown): unknown => {
      if (Array.isArray(obj)) return obj.map(scrub);
      if (obj && typeof obj === "object") {
        return Object.fromEntries(
          Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
            k,
            SECRET_KEY_PATTERN.test(k) ? "[REDACTED]" : scrub(v),
          ]),
        );
      }
      return obj;
    };
    return JSON.stringify(scrub(parsed));
  } catch {
    return value;
  }
}

export function hashForLog(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function notifyStreamOfDelivery(orgId: string, deliveryId: string, status: string) {
  publishToStream(orgId, { type: "webhook.delivery.updated", payload: { deliveryId, status } });
}
