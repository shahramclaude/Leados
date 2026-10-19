import type { Forecast } from "./types";

// ---------------------------------------------------------------------------
// forecastCache.ts — process-local memoization for forecasts.
//
// Forecasting (especially Holt-Winters) is the most expensive step in the
// pipeline. Since `runMetricsIntelligence` can be invoked repeatedly within
// a short window (API route + orchestrator), we cache the last computed
// forecast per metric key for a short TTL keyed off the input data
// fingerprint (point count + last value + last timestamp) so a cache hit is
// only returned when nothing has actually changed.
// ---------------------------------------------------------------------------

interface CacheEntry {
  fingerprint: string;
  forecast: Forecast;
  cachedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry>();

export function buildFingerprint(
  pointCount: number,
  lastValue: number,
  lastRecordedAt: Date,
): string {
  return `${pointCount}:${lastValue}:${lastRecordedAt.getTime()}`;
}

export function getCachedForecast(
  metricKey: string,
  fingerprint: string,
): Forecast | null {
  const entry = cache.get(metricKey);
  if (!entry) return null;
  if (entry.fingerprint !== fingerprint) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
  return entry.forecast;
}

export function setCachedForecast(
  metricKey: string,
  fingerprint: string,
  forecast: Forecast,
): void {
  cache.set(metricKey, { fingerprint, forecast, cachedAt: Date.now() });
}

export function clearForecastCache(): void {
  cache.clear();
}
