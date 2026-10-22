/**
 * src/lib/staleCache.ts — Part 18 degradation primitive.
 *
 * Generic stale-while-revalidate cache with request coalescing
 * ("singleflight"): used by the heatmap aggregation, the network query, and
 * (wrapped by forecastCache.ts) the Monte Carlo forecast.
 *
 * Behaviour, in order of preference:
 *  1. Fresh entry in cache (age < ttlMs)            -> return immediately, `stale:false`.
 *  2. Stale entry in cache + nobody else refreshing  -> kick off a background
 *     recompute (not awaited), return the stale value immediately with
 *     `stale:true` and `staleForMs` so the UI can render
 *     "slow query — showing cached from Nm ago".
 *  3. Stale entry + a refresh already in flight       -> same as (2) but does
 *     not start a second concurrent compute (singleflight).
 *  4. No entry at all                                 -> await the compute
 *     (first caller pays the cost), store, return fresh.
 *
 * This is deliberately NOT the same cache as the canonical
 * `forecastCache` correctness cache (which invalidates only on new evidence
 * events, never on a timer — see src/lib/forecastCache.ts for the
 * reconciliation note). This module only answers "is compute saturated right
 * now", never "is this answer still true".
 */

interface Entry<T> {
  value: T;
  computedAt: number;
  computeMs: number;
}

export interface StaleResult<T> {
  value: T;
  stale: boolean;
  staleForMs: number;
  computeMs: number;
}

export class StaleCache<T> {
  private store = new Map<string, Entry<T>>();
  private inFlight = new Map<string, Promise<T>>();

  constructor(private ttlMs: number) {}

  async getOrCompute(key: string, compute: () => Promise<T>): Promise<StaleResult<T>> {
    const existing = this.store.get(key);
    const now = Date.now();

    if (existing && now - existing.computedAt < this.ttlMs) {
      return { value: existing.value, stale: false, staleForMs: 0, computeMs: existing.computeMs };
    }

    if (existing) {
      // Stale-while-revalidate: serve what we have, refresh in background.
      this.refreshInBackground(key, compute);
      return {
        value: existing.value,
        stale: true,
        staleForMs: now - existing.computedAt,
        computeMs: existing.computeMs,
      };
    }

    // No entry at all: await the compute, deduped via singleflight.
    const inflight = this.inFlight.get(key);
    if (inflight) {
      const value = await inflight;
      return { value, stale: false, staleForMs: 0, computeMs: this.store.get(key)?.computeMs ?? 0 };
    }
    const promise = this.runAndStore(key, compute);
    this.inFlight.set(key, promise);
    try {
      const value = await promise;
      return { value, stale: false, staleForMs: 0, computeMs: this.store.get(key)?.computeMs ?? 0 };
    } finally {
      this.inFlight.delete(key);
    }
  }

  private refreshInBackground(key: string, compute: () => Promise<T>) {
    if (this.inFlight.has(key)) return; // already refreshing
    const promise = this.runAndStore(key, compute).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
  }

  private async runAndStore(key: string, compute: () => Promise<T>): Promise<T> {
    const start = Date.now();
    const value = await compute();
    this.store.set(key, { value, computedAt: Date.now(), computeMs: Date.now() - start });
    return value;
  }

  invalidate(key: string) {
    this.store.delete(key);
  }

  invalidateAll() {
    this.store.clear();
  }

  size() {
    return this.store.size;
  }
}
