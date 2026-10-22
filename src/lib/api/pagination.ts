import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { ApiError } from "./errors";

/**
 * Generic composite ("keyset") cursor: { v: <stringified sort-field value>, id }.
 * Using a Postgres ROW() comparison — (sortColumn, idColumn) < (v, id) — gives
 * correct, gap-free pagination for *any* whitelisted sort field, including
 * ties on the sort field (the id is always the deterministic tiebreaker).
 */
export type Cursor = { v: string; id: string };

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed.v !== "string" || typeof parsed.id !== "string") {
      throw new Error("shape");
    }
    return parsed as Cursor;
  } catch {
    throw new ApiError("INVALID_CURSOR");
  }
}

export function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new ApiError("VALIDATION_ERROR", "limit must be a positive integer");
  }
  return Math.min(n, MAX_LIMIT);
}

export type SortSpec = { field: string; direction: "asc" | "desc" };

/** sort=-createdAt | sort=createdAt, validated against a per-route whitelist. */
export function parseSort(raw: string | null, allowed: string[], fallback: string): SortSpec {
  const value = raw ?? fallback;
  const direction: "asc" | "desc" = value.startsWith("-") ? "desc" : "asc";
  const field = value.startsWith("-") ? value.slice(1) : value;
  if (!allowed.includes(field)) {
    throw new ApiError("UNSUPPORTED_SORT", `sort=${value} is not supported. Allowed fields: ${allowed.join(", ")}`);
  }
  return { field, direction };
}

export type FilterOp = "eq" | "gte" | "lte";
export type ParsedFilter = { field: string; op: FilterOp; value: string };

/**
 * Parses whitelisted filter query params of the form field, field[gte], field[lte], field[eq].
 * Throws UNSUPPORTED_FILTER on any non-whitelisted field/op so typos fail loudly instead of
 * silently being ignored.
 */
export function parseFilters(
  searchParams: URLSearchParams,
  allowed: Record<string, FilterOp[]>,
  reserved: string[],
): ParsedFilter[] {
  const out: ParsedFilter[] = [];
  for (const [key, value] of searchParams.entries()) {
    if (reserved.includes(key)) continue;
    const match = key.match(/^([a-zA-Z0-9_]+)(?:\[(eq|gte|lte)\])?$/);
    if (!match) {
      throw new ApiError("UNSUPPORTED_FILTER", `Unsupported filter parameter: ${key}`);
    }
    const [, field, opRaw] = match;
    const op = (opRaw ?? "eq") as FilterOp;
    const allowedOps = allowed[field];
    if (!allowedOps || !allowedOps.includes(op)) {
      throw new ApiError("UNSUPPORTED_FILTER", `Filter not supported: ${key}`);
    }
    out.push({ field, op, value });
  }
  return out;
}

/** Builds the `(sortColumn, idColumn) < / > (v, id)` keyset predicate for the given cursor. */
export function cursorRowCondition(
  sortColumn: AnyPgColumn,
  idColumn: AnyPgColumn,
  cursor: Cursor,
  direction: "asc" | "desc",
): SQL {
  return direction === "desc"
    ? sql`(${sortColumn}, ${idColumn}) < (${cursor.v}, ${cursor.id})`
    : sql`(${sortColumn}, ${idColumn}) > (${cursor.v}, ${cursor.id})`;
}

/** Stringifies a row's sort-field value into the canonical cursor `v` format. */
export function cursorValueOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function buildPageMeta<T extends { id: string }>(
  rows: T[],
  limit: number,
  sortField: keyof T,
): { items: T[]; hasMore: boolean; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ v: cursorValueOf(last[sortField]), id: last.id }) : null;
  return { items, hasMore, nextCursor };
}
