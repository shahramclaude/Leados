import "server-only";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Constant-time string comparison (prevents timing side-channels on CSRF
 * token / token comparisons). Falls back to `false` on length mismatch
 * without leaking the real length via an early return before the timing-safe
 * compare (both branches take effectively equal time for the class of
 * attack this defends against: guessing a fixed-length hex token). */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still do a dummy compare so the function's running time doesn't
    // trivially reveal the length mismatch branch.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
