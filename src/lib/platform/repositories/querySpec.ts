import { z } from "zod";

// `query(spec)` bound: limit is capped at 200 server-side. There is no way
// to request more — callers that need "all rows" must paginate with cursor.
export const MAX_QUERY_LIMIT = 200;
export const DEFAULT_QUERY_LIMIT = 50;

export const FilterOpSchema = z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in"]);
export type FilterOp = z.infer<typeof FilterOpSchema>;

export const FilterSchema = z.object({
  field: z.string().min(1),
  op: FilterOpSchema,
  value: z.unknown(),
});
export type Filter = z.infer<typeof FilterSchema>;

export const SortSchema = z.object({
  field: z.string().min(1).default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export type Sort = z.infer<typeof SortSchema>;

export const QuerySpecSchema = z.object({
  filters: z.array(FilterSchema).default([]),
  sort: SortSchema.default({ field: "updatedAt", direction: "desc" }),
  cursor: z.string().nullable().default(null),
  limit: z.number().int().positive().max(MAX_QUERY_LIMIT).default(DEFAULT_QUERY_LIMIT),
  includeDeleted: z.boolean().default(false),
});
export type QuerySpec = z.infer<typeof QuerySpecSchema>;

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};

export function encodeCursor(value: { sortValue: string; id: string }): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { sortValue: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof parsed === "object" && parsed && "sortValue" in parsed && "id" in parsed) {
      return parsed as { sortValue: string; id: string };
    }
    return null;
  } catch {
    return null;
  }
}
