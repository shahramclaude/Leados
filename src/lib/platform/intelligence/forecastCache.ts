/**
 * forecastCache.ts — Part 04-F. Caches `Forecast` objects keyed by
 * `(inputsHash, modelVersion)`. Explicitly NOT a TTL cache: standing order F
 * requires invalidation "by new evidence events, not timers". This module
 * subscribes to `eventLog` and drops every cached entry whenever an
 * `evidence.recorded` event is appended, so a forecast is only ever stale
 * because the world changed, never because a clock ticked.
 */

import { eventLog } from "./eventLog";
import type { Forecast } from "../../domain/intelligence/types";

class ForecastCache {
  private cache = new Map<string, Forecast>();
  private invalidationCount = 0;
  private unsubscribe: () => void;

  constructor() {
    this.unsubscribe = eventLog.subscribe((evt) => {
      if (evt.eventType === "evidence.recorded") {
        this.invalidateAll(`event:${evt.id}`);
      }
    });
  }

  private key(inputsHash: string, modelVersion: string): string {
    return `${inputsHash}:${modelVersion}`;
  }

  get(inputsHash: string, modelVersion: string): Forecast | undefined {
    return this.cache.get(this.key(inputsHash, modelVersion));
  }

  set(inputsHash: string, modelVersion: string, forecast: Forecast): void {
    this.cache.set(this.key(inputsHash, modelVersion), forecast);
  }

  getOrCompute(inputsHash: string, modelVersion: string, compute: () => Forecast): { forecast: Forecast; cacheHit: boolean } {
    const existing = this.get(inputsHash, modelVersion);
    if (existing) return { forecast: existing, cacheHit: true };
    const forecast = compute();
    this.set(inputsHash, modelVersion, forecast);
    return { forecast, cacheHit: false };
  }

  invalidateAll(reason: string): void {
    if (this.cache.size === 0) return;
    this.cache.clear();
    this.invalidationCount++;
    eventLog.append("forecast.cache.invalidated", { reason, invalidationCount: this.invalidationCount });
  }

  size(): number {
    return this.cache.size;
  }

  destroy(): void {
    this.unsubscribe();
  }
}

export const forecastCache = new ForecastCache();
