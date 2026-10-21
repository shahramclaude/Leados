// In-memory token-bucket rate limiter, keyed per API token. Suitable for a
// single-instance deployment; production multi-instance deployments should
// swap this for a shared store (Redis `INCR`/`EXPIRE` or a leaky-bucket Lua
// script) without changing the call site in withApiRoute(). This limitation
// is called out explicitly in docs/API.md and the Part 14 self-review.
interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export function consumeRateLimit(key: string, limitPerMinute: number): RateLimitResult {
  const now = Date.now();
  const refillRatePerMs = limitPerMinute / 60_000;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: limitPerMinute, lastRefillMs: now };
    buckets.set(key, bucket);
  }
  const elapsed = now - bucket.lastRefillMs;
  bucket.tokens = Math.min(limitPerMinute, bucket.tokens + elapsed * refillRatePerMs);
  bucket.lastRefillMs = now;

  const resetSeconds = Math.ceil((limitPerMinute - bucket.tokens) / (limitPerMinute / 60));

  if (bucket.tokens < 1) {
    return { allowed: false, limit: limitPerMinute, remaining: 0, resetSeconds: Math.max(1, resetSeconds) };
  }
  bucket.tokens -= 1;
  return {
    allowed: true,
    limit: limitPerMinute,
    remaining: Math.floor(bucket.tokens),
    resetSeconds: Math.max(0, resetSeconds),
  };
}

export function resetRateLimitState() {
  buckets.clear();
}
