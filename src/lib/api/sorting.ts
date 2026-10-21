import { ApiError } from "./errors";

export interface ParsedSort {
  field: string;
  direction: "asc" | "desc";
}

/**
 * Parses `sort=-createdAt` (descending) or `sort=score` (ascending) against a
 * whitelist of sortable fields. Only a single sort field is supported today;
 * the `id` column is always appended server-side as a tiebreaker for cursor
 * correctness (see pagination.ts).
 */
export function parseSort(
  searchParams: URLSearchParams,
  whitelist: string[],
  fallback: ParsedSort,
): ParsedSort {
  const raw = searchParams.get("sort");
  if (!raw) return fallback;
  const direction: "asc" | "desc" = raw.startsWith("-") ? "desc" : "asc";
  const field = raw.startsWith("-") ? raw.slice(1) : raw;
  if (!whitelist.includes(field)) {
    throw new ApiError(
      "UNSUPPORTED_SORT",
      `Field "${field}" cannot be used in sort. Allowed: ${whitelist.join(", ")}.`,
      { field },
    );
  }
  return { field, direction };
}
