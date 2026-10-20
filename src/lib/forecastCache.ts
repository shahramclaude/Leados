// src/lib/forecastCache.ts
//
// In-process cache for Monte Carlo forecast projections, keyed by a hash of
// the forecast input. Forecasts are expensive (10k-trial simulations can
// take tens of milliseconds — see docs/PERFORMANCE.md "Simulation
// runtimes") and the same input is requested repeatedly as users revisit
// the metrics dashboard, so caching the projection avoids recomputing it on
// every page view.
//
// Invalidation is EXPLICIT, not time-based: `invalidateForecastCache()` is
// called from `src/lib/events.ts#recordEvent()` every time a new event is
// written, because a new event can change the inputs a forecast is derived
// from (e.g. recomputed growth rate). This trades a slightly more
// conservative cache (it clears more than strictly necessary) for a
// guarantee that the dashboard never shows a forecast that is stale with
// respect to the event log — the thing Part 12's brief explicitly asks for
// ("cache projections with explicit invalidation on new events").
import { hashString } from "./mathUtils";
import type { ForecastInput, ForecastResult } from "./monteCarlo";

interface CacheEntry {
  result: ForecastResult;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();
let epoch = 0;
let hits = 0;
let misses = 0;

export function forecastCacheKey(input: ForecastInput): string {
  return `${epoch}:${hashString(JSON.stringify(input))}`;
}

export function getCachedForecast(input: ForecastInput): ForecastResult | null {
  const entry = cache.get(forecastCacheKey(input));
  if (!entry) {
    misses += 1;
    return null;
  }
  hits += 1;
  return entry.result;
}

export function setCachedForecast(input: ForecastInput, result: ForecastResult): void {
  cache.set(forecastCacheKey(input), { result, cachedAt: Date.now() });
}

/** Called after every successful event write. Drops all cached projections. */
export function invalidateForecastCache(): void {
  epoch += 1;
  cache.clear();
}

export function forecastCacheStats() {
  return { size: cache.size, epoch, hits, misses, hitRate: hits + misses === 0 ? 0 : +(hits / (hits + misses)).toFixed(3) };
}
