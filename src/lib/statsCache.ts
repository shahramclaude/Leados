import { getDailyBuckets, type DailyBucket } from "./stats";

// Explicitly-invalidated in-memory cache for the daily aggregation query.
// Avoids re-scanning/re-aggregating the events table on every dashboard
// request; invalidated the moment a new event is ingested (see
// src/app/api/events/route.ts POST handler).
const cache = new Map<number, { value: DailyBucket[]; computedAt: number }>();

export function invalidateStatsCache(): void {
  cache.clear();
}

export async function getCachedDailyBuckets(days: number): Promise<{ value: DailyBucket[]; cache: "hit" | "miss" }> {
  const hit = cache.get(days);
  if (hit) return { value: hit.value, cache: "hit" };
  const value = await getDailyBuckets(days);
  cache.set(days, { value, computedAt: Date.now() });
  return { value, cache: "miss" };
}
