// Shared HMAC verification logic for inbound webhook payloads. Re-exported
// from the public SDK (`sdk.ts`) so integrators and our own sandbox receiver
// use the exact same implementation.
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(opts: {
  secret: string;
  timestamp: string;
  rawBody: string;
  signatureHeader: string;
  toleranceSeconds?: number;
}): boolean {
  const expected = createHmac("sha256", opts.secret).update(`${opts.timestamp}.${opts.rawBody}`).digest("hex");
  const provided = opts.signatureHeader.replace(/^sha256=/, "");

  const tolerance = opts.toleranceSeconds ?? 300;
  const age = Math.abs(Date.now() / 1000 - Number(opts.timestamp));
  if (!Number.isFinite(age) || age > tolerance) return false;

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
