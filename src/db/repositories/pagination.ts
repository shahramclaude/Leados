/**
 * src/db/repositories/pagination.ts
 * Shared pagination contract — Phase 1 budget requires "zero unbounded
 * queries", so every list endpoint goes through this helper, which hard-caps
 * page size server-side regardless of what the client asks for.
 */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export function parsePageParams(searchParams: URLSearchParams) {
  const rawLimit = Number(searchParams.get("limit") ?? DEFAULT_PAGE_SIZE);
  const rawOffset = Number(searchParams.get("offset") ?? 0);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.trunc(rawLimit)), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.trunc(rawOffset)) : 0;
  return { limit, offset };
}

export interface Page<T> {
  items: T[];
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}
