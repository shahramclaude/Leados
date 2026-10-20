// src/lib/queryCache.ts
//
// Tiny in-process TTL cache for read-heavy aggregate queries (dashboard
// stats, KPI tiles) that would otherwise run several COUNT/aggregate scans
// on every request. Not a replacement for Redis in a multi-instance
// deployment — documented as a known limitation in docs/PERFORMANCE.md —
// but it is what turns the stats endpoint from "recomputed every request"
// into "recomputed at most once every TTL_MS", which is the dominant cost
// at the request volumes this app runs at.
interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }
  const value = await compute();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function invalidate(key: string): void {
  store.delete(key);
}

export function invalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function cacheSize(): number {
  return store.size;
}
