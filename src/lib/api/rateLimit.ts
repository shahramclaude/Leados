/**
 * In-memory token-bucket rate limiter, keyed per API key (or IP for unauthenticated calls).
 *
 * LIMITATION (documented, not hidden): this is per-process state. In a
 * multi-instance deployment this should move to Redis/Upstash. For the
 * scope of this part (single Next.js server instance) it is sufficient
 * to demonstrate the RateLimit-* header contract and 429 behavior.
 */

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
};

type Bucket = { tokens: number; lastRefillMs: number };

const buckets = new Map<string, Bucket>();

const DEFAULT_CAPACITY = 60; // tokens
const REFILL_PER_SEC = 1; // tokens/sec

export function takeToken(key: string, capacity = DEFAULT_CAPACITY, refillPerSec = REFILL_PER_SEC): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: capacity, lastRefillMs: now };
    buckets.set(key, bucket);
  }
  const elapsedSec = (now - bucket.lastRefillMs) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
  bucket.lastRefillMs = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      limit: capacity,
      remaining: Math.floor(bucket.tokens),
      resetSeconds: Math.ceil((capacity - bucket.tokens) / refillPerSec),
    };
  }
  return {
    allowed: false,
    limit: capacity,
    remaining: 0,
    resetSeconds: Math.ceil((1 - bucket.tokens) / refillPerSec),
  };
}

/** Test/ops helper to reset state between contract test runs. */
export function resetRateLimits() {
  buckets.clear();
}
