/**
 * In-memory fixed-window rate limiter.
 *
 * KNOWN LIMITATION (documented, not hidden): this limiter is per-process
 * memory. It is correct for a single-instance deployment (see
 * docker-compose.production.yml) but will under-count requests across a
 * horizontally scaled, multi-instance deployment because each instance keeps
 * its own counters. The production hardening follow-up is to swap this
 * module's storage for Redis (e.g. `INCR` + `EXPIRE`) behind the exact same
 * `consume()` interface — no call sites would need to change. Tracked in
 * docs/SECURITY.md "Known limitations".
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodically sweep expired buckets so the map can't grow unbounded.
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

let lastSweep = 0;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function consumeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (now - lastSweep > windowMs) {
    sweep(now);
    lastSweep = now;
  }
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

/** Test-only helper to reset state between test files. */
export function __resetRateLimitsForTests() {
  buckets.clear();
}
