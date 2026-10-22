// In-memory fixed-window rate limiter.
//
// Honest limitation (documented, not hidden): this is per-process state. A
// single-instance deployment (see docker-compose.production.yml — one `app`
// service) gets real protection from it. A horizontally-scaled deployment
// needs a shared store (Redis `INCR`+`EXPIRE`) behind the same
// `consumeRateLimit` signature — swapping the implementation is contained to
// this file because every caller only depends on the function below, not on
// how/where counters are stored. Tracked in docs/THREAT-MODEL.md.
import "server-only";

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function consumeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  existing.count += 1;
  const allowed = existing.count <= limit;
  return { allowed, remaining: Math.max(0, limit - existing.count), resetAt: existing.windowStart + windowMs };
}

/** Test-only: clears all in-memory counters so test suites don't bleed state
 * between cases. Not exported from any client-reachable path. */
export function __resetRateLimitsForTests() {
  buckets.clear();
}

// Periodically sweep old buckets so long-running processes don't leak
// memory for one-off keys (e.g. per-IP login attempts from transient IPs).
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
if (typeof setInterval !== "undefined" && process.env.NODE_ENV !== "test") {
  const timer = setInterval(() => {
    const cutoff = Date.now() - SWEEP_INTERVAL_MS;
    for (const [key, bucket] of buckets) {
      if (bucket.windowStart < cutoff) buckets.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
}
