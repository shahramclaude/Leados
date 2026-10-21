import { and, asc, desc, eq, gt, lt, or, type SQL } from "drizzle-orm";
import { ApiError } from "./errors";

export interface CursorValue {
  // value of the sorted field for the last row of the previous page
  v: string | number;
  // id tiebreaker for the last row of the previous page (always unique)
  id: string;
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

export function parseLimit(searchParams: URLSearchParams): number {
  const raw = searchParams.get("limit");
  if (!raw) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
    throw new ApiError("VALIDATION_ERROR", `limit must be an integer between 1 and ${MAX_LIMIT}.`, {
      field: "limit",
    });
  }
  return n;
}

export function encodeCursor(value: CursorValue): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null): CursorValue | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "v" in parsed &&
      "id" in parsed &&
      typeof parsed.id === "string"
    ) {
      return parsed as CursorValue;
    }
    throw new Error("shape");
  } catch {
    throw new ApiError("INVALID_CURSOR", "The `cursor` parameter is malformed or expired.", {
      field: "cursor",
    });
  }
}

/**
 * Builds a composite keyset ("seek") condition for cursor pagination:
 *   (sortColumn <op> cursor.v) OR (sortColumn = cursor.v AND idColumn <op> cursor.id)
 *
 * This two-column composite tiebreak is required because `sortColumn` alone
 * is not guaranteed unique (e.g. many leads created in the same millisecond,
 * or ties on `score`). Without the `id` tiebreak, rows with an identical
 * sort value would be nondeterministically skipped or duplicated across
 * pages when the underlying table is written to concurrently. See
 * docs/API.md "Pagination correctness" and scripts/contract-test.ts
 * (`paginationNoSkipNoDup`) for the regression test covering this.
 */
export function buildKeysetCondition(
  sortColumn: SQL.Aliased | any,
  idColumn: any,
  cursor: CursorValue | null,
  direction: "asc" | "desc",
): SQL | undefined {
  if (!cursor) return undefined;
  const cmp = direction === "desc" ? lt : gt;
  return or(cmp(sortColumn, cursor.v), and(eq(sortColumn, cursor.v), cmp(idColumn, cursor.id)));
}

export function orderFns(direction: "asc" | "desc") {
  return direction === "desc" ? desc : asc;
}

export interface PageMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

/**
 * Given `limit + 1` rows fetched in sort order, returns the page (trimmed to
 * `limit`) plus pagination metadata. Centralizing this avoids the classic
 * off-by-one bug where the extra probe row leaks into the response.
 */
export function paginate<T extends Record<string, unknown>>(
  rows: T[],
  limit: number,
  sortField: keyof T,
  idField: keyof T,
): { page: T[]; meta: PageMeta } {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ v: last[sortField] as string | number, id: String(last[idField]) })
      : null;
  return { page, meta: { nextCursor, hasMore, limit } };
}
