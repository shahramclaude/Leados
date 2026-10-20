import { db } from "@/db";
import { forecastCache } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getDailyBuckets, getEventCount, projectTrend } from "./stats";

// ---------------------------------------------------------------------------
// Forecast projections are expensive to compute (full-history aggregation +
// trend fit) so they are cached in both process memory (fast path, survives
// for the life of the server process / lambda instance) and in Postgres
// (durable path, survives restarts / shared across instances).
//
// Invalidation is EXPLICIT: nothing polls. Any code path that writes new
// events must call `invalidateForecastCache()` so the next read recomputes.
// This keeps reads O(1) in the common case instead of re-aggregating the
// events table on every dashboard load.
// ---------------------------------------------------------------------------

type ForecastPayload = {
  horizonDays: number;
  computedAt: string;
  eventCountAtCompute: number;
  slope: number;
  intercept: number;
  noise: number;
  projected: { day: number; expected: number; low: number; high: number }[];
};

type MemEntry = { value: ForecastPayload; eventCountAtCompute: number };

const memCache = new Map<string, MemEntry>();
let generation = 0;

export function cacheKey(horizonDays: number): string {
  return `trend:${horizonDays}d`;
}

/** Bump this to invalidate every in-memory entry cheaply (O(1)) without a DB round trip. */
export function invalidateForecastCache(): void {
  generation += 1;
  memCache.clear();
}

export function getCacheGeneration(): number {
  return generation;
}

async function computeForecast(horizonDays: number): Promise<ForecastPayload> {
  const [buckets, eventCount] = await Promise.all([getDailyBuckets(90), getEventCount()]);
  const { slope, intercept, noise, projected } = projectTrend(buckets, horizonDays);
  return {
    horizonDays,
    computedAt: new Date().toISOString(),
    eventCountAtCompute: eventCount,
    slope,
    intercept,
    noise,
    projected,
  };
}

export async function getForecast(
  horizonDays: number,
  options?: { forceRecompute?: boolean },
): Promise<{ payload: ForecastPayload; cache: "memory" | "db" | "miss" }> {
  const key = cacheKey(horizonDays);

  if (!options?.forceRecompute) {
    const mem = memCache.get(key);
    if (mem) return { payload: mem.value, cache: "memory" };

    const [row] = await db.select().from(forecastCache).where(eq(forecastCache.key, key)).limit(1);
    if (row) {
      const payload = row.payload as unknown as ForecastPayload;
      memCache.set(key, { value: payload, eventCountAtCompute: row.eventCountAtCompute });
      return { payload, cache: "db" };
    }
  }

  const payload = await computeForecast(horizonDays);
  memCache.set(key, { value: payload, eventCountAtCompute: payload.eventCountAtCompute });

  await db
    .insert(forecastCache)
    .values({
      key,
      horizonDays,
      eventCountAtCompute: payload.eventCountAtCompute,
      payload: payload as unknown as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: forecastCache.key,
      set: {
        horizonDays,
        computedAt: new Date(),
        eventCountAtCompute: payload.eventCountAtCompute,
        payload: payload as unknown as Record<string, unknown>,
      },
    });

  return { payload, cache: "miss" };
}
