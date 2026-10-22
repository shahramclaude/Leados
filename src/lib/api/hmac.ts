import { createHmac, timingSafeEqual } from "crypto";

export const WEBHOOK_SIGNATURE_HEADER = "X-Leados-Signature";
export const WEBHOOK_TIMESTAMP_HEADER = "X-Leados-Timestamp";
export const WEBHOOK_ID_HEADER = "X-Leados-Delivery-Id";

/** Replay protection window: timestamps older than this are rejected by verifiers. */
export const REPLAY_TOLERANCE_SECONDS = 5 * 60;

/**
 * Signs `${timestamp}.${rawBody}` with HMAC-SHA256 using the subscription secret.
 * Mirrors Stripe/GitHub-style webhook signing so integrators can reuse familiar patterns.
 */
export function signPayload(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function buildSignatureHeader(secret: string, timestamp: number, rawBody: string): string {
  return `t=${timestamp},v1=${signPayload(secret, timestamp, rawBody)}`;
}

export type VerifyResult = { valid: boolean; reason?: string };

/**
 * Verifies an inbound/received webhook signature header of the form `t=<unix>,v1=<hex>`.
 * Rejects stale/replayed timestamps outside REPLAY_TOLERANCE_SECONDS.
 */
export function verifySignatureHeader(
  secret: string,
  signatureHeader: string | null,
  rawBody: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): VerifyResult {
  if (!signatureHeader) return { valid: false, reason: "missing signature header" };
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, v];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return { valid: false, reason: "malformed signature header" };

  if (Math.abs(nowSeconds - t) > REPLAY_TOLERANCE_SECONDS) {
    return { valid: false, reason: "timestamp outside replay tolerance window" };
  }

  const expected = signPayload(secret, t, rawBody);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(v1, "hex");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, reason: "signature mismatch" };
  }
  return { valid: true };
}
