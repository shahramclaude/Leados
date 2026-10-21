"use client";

// ---------------------------------------------------------------------------
// Client-side GET cache/dedupe manager: same URL requested by two components
// in the same tick shares one in-flight request, and a stale-while-revalidate
// read is available for instant paint + background refresh. This replaces
// the Part-0 pattern of each component calling fetch() independently (which
// was the root cause of duplicated client entity state across stores).
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  promise: Promise<T> | null;
  data?: T;
  updatedAt?: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const TTL_MS = 15_000;

export async function queryManagerFetch<T>(key: string, fetcher: () => Promise<T>, options?: { force?: boolean }): Promise<T> {
  const entry = (cache.get(key) as CacheEntry<T> | undefined) ?? { promise: null };
  const isFresh = entry.updatedAt && Date.now() - entry.updatedAt < TTL_MS;

  if (!options?.force && isFresh && entry.data !== undefined) {
    return entry.data;
  }

  if (entry.promise) return entry.promise;

  const promise = fetcher()
    .then((data) => {
      cache.set(key, { promise: null, data, updatedAt: Date.now() });
      return data;
    })
    .catch((err) => {
      cache.set(key, { promise: null, data: entry.data, updatedAt: entry.updatedAt });
      throw err;
    });

  cache.set(key, { ...entry, promise });
  return promise;
}

export function invalidateQuery(keyPrefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) cache.delete(key);
  }
}

export function peekCached<T>(key: string): T | undefined {
  return (cache.get(key) as CacheEntry<T> | undefined)?.data;
}
