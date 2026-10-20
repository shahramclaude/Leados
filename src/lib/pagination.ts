// src/lib/pagination.ts
//
// Keyset ("cursor") pagination helpers. Every list endpoint in this app
// (events, findings, notifications) is ordered by `(createdAt desc, id
// desc)` and paginates with a `cursor` query param instead of `OFFSET`.
// OFFSET pagination degrades linearly with page depth because Postgres has
// to walk and discard every preceding row; keyset pagination uses the
// `events_created_at_idx` (or equivalent) index to seek directly to the
// right spot regardless of how deep the page is — see docs/PERFORMANCE.md
// "Pagination" for the measured before/after on a 100k-row table.
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export interface Cursor {
  createdAt: string;
  id: number;
}

export function parseLimit(searchParams: URLSearchParams, fallback = DEFAULT_PAGE_SIZE): number {
  const raw = Number(searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.floor(raw));
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Cursor>;
    if (typeof parsed.id !== "number" || typeof parsed.createdAt !== "string") return null;
    return { id: parsed.id, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
