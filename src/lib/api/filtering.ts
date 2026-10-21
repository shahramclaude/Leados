import { ApiError } from "./errors";

export type FilterOp = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";

export interface ParsedFilter {
  field: string;
  op: FilterOp;
  value: string;
}

const OP_PATTERN = /^(.+)\[(eq|ne|gt|gte|lt|lte|contains|in)\]$/;

/**
 * Parses `field[op]=value` query parameters (e.g. `score[gte]=50`,
 * `stage[in]=won,lost`) against a per-resource whitelist of allowed
 * operators per field. Unknown fields or disallowed ops raise
 * `UNSUPPORTED_FILTER` (400) rather than being silently ignored, so API
 * consumers never get a misleadingly-filtered page back.
 */
export function parseFilters(
  searchParams: URLSearchParams,
  whitelist: Record<string, FilterOp[]>,
): ParsedFilter[] {
  const reserved = new Set(["cursor", "limit", "sort"]);
  const filters: ParsedFilter[] = [];
  for (const [key, value] of searchParams.entries()) {
    if (reserved.has(key)) continue;
    const match = key.match(OP_PATTERN);
    if (!match) {
      throw new ApiError(
        "UNSUPPORTED_FILTER",
        `Query parameter "${key}" is not a recognized filter. Use field[op]=value, e.g. stage[eq]=won.`,
        { field: key },
      );
    }
    const [, field, op] = match;
    const allowedOps = whitelist[field];
    if (!allowedOps) {
      throw new ApiError("UNSUPPORTED_FILTER", `Field "${field}" cannot be filtered.`, { field });
    }
    if (!allowedOps.includes(op as FilterOp)) {
      throw new ApiError(
        "UNSUPPORTED_FILTER",
        `Operator "${op}" is not allowed on field "${field}". Allowed: ${allowedOps.join(", ")}.`,
        { field, op },
      );
    }
    filters.push({ field, op: op as FilterOp, value });
  }
  return filters;
}
