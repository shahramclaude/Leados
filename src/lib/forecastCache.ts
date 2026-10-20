/**
 * forecastCache.ts — in-process memoization for scenario/forecast
 * computations, keyed by a content hash of (scenario spec + seed set +
 * model version) so any change to the spec automatically invalidates the
 * cache entry (no manual invalidation bookkeeping needed).
 *
 * This is intentionally a simple bounded LRU in module memory, NOT a
 * distributed cache — adequate for a single Next.js server process. If
 * Part 06 is later deployed with multiple server instances, swap the
 * backing store for a shared cache (e.g. Redis) behind the same
 * `get`/`set` contract.
 */
import { createHash } from "node:crypto";

const MODEL_VERSION = "leados-sim-v1";

export function forecastCacheKey(spec: unknown, extra: Record<string, unknown> = {}): string {
  const payload = JSON.stringify({ modelVersion: MODEL_VERSION, spec, extra });
  return createHash("sha256").update(payload).digest("hex");
}

interface CacheEntry<T> {
  value: T;
  insertedAt: number;
}

export class ForecastCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  constructor(private maxEntries = 100, private ttlMs = 1000 * 60 * 30) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.insertedAt > this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    // refresh recency
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, insertedAt: Date.now() });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

const globalForCache = globalThis as typeof globalThis & {
  __leadosScenarioCache?: ForecastCache<unknown>;
};

/** Process-wide singleton cache for scenario run results. */
export function getScenarioResultCache<T>(): ForecastCache<T> {
  if (!globalForCache.__leadosScenarioCache) {
    globalForCache.__leadosScenarioCache = new ForecastCache<unknown>();
  }
  return globalForCache.__leadosScenarioCache as ForecastCache<T>;
}
