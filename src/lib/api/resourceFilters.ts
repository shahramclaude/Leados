import { eq, gt, gte, ilike, inArray, lt, lte, ne, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { parseFilters, type FilterOp } from "./filtering";

export const LEAD_FILTER_WHITELIST: Record<string, FilterOp[]> = {
  stage: ["eq", "in"],
  score: ["eq", "gt", "gte", "lt", "lte"],
  company: ["eq", "contains"],
  createdAt: ["gt", "gte", "lt", "lte"],
  accountId: ["eq"],
  email: ["eq"],
};

export const ACCOUNT_FILTER_WHITELIST: Record<string, FilterOp[]> = {
  name: ["eq", "contains"],
  domain: ["eq"],
  createdAt: ["gt", "gte", "lt", "lte"],
};

export const EVENT_FILTER_WHITELIST: Record<string, FilterOp[]> = {
  type: ["eq", "in"],
  createdAt: ["gt", "gte", "lt", "lte"],
};

export const WEBHOOK_DELIVERY_FILTER_WHITELIST: Record<string, FilterOp[]> = {
  status: ["eq", "in"],
  eventType: ["eq"],
  createdAt: ["gt", "gte", "lt", "lte"],
};

export const AUTOMATION_RUN_FILTER_WHITELIST: Record<string, FilterOp[]> = {
  status: ["eq", "in"],
  playbookKey: ["eq"],
  createdAt: ["gt", "gte", "lt", "lte"],
};

function coerce(field: string, value: string): string | number | Date {
  if (field === "score") return Number(value);
  if (field === "createdAt") return new Date(value);
  return value;
}

/**
 * Converts whitelisted `field[op]=value` query parameters into Drizzle SQL
 * conditions against the supplied column map. Numeric/date fields are
 * coerced before comparison so `score[gte]=50` and `createdAt[gt]=...`
 * behave correctly instead of doing a lexicographic string compare.
 */
export function buildFilterConditions(
  searchParams: URLSearchParams,
  whitelist: Record<string, FilterOp[]>,
  columns: Record<string, AnyPgColumn>,
): SQL[] {
  const filters = parseFilters(searchParams, whitelist);
  const conditions: SQL[] = [];
  for (const f of filters) {
    const column = columns[f.field];
    if (!column) continue;
    switch (f.op) {
      case "eq":
        conditions.push(eq(column, coerce(f.field, f.value)));
        break;
      case "ne":
        conditions.push(ne(column, coerce(f.field, f.value)));
        break;
      case "gt":
        conditions.push(gt(column, coerce(f.field, f.value)));
        break;
      case "gte":
        conditions.push(gte(column, coerce(f.field, f.value)));
        break;
      case "lt":
        conditions.push(lt(column, coerce(f.field, f.value)));
        break;
      case "lte":
        conditions.push(lte(column, coerce(f.field, f.value)));
        break;
      case "contains":
        conditions.push(ilike(column, `%${f.value}%`));
        break;
      case "in":
        conditions.push(inArray(column, f.value.split(",").map((v) => coerce(f.field, v))));
        break;
    }
  }
  return conditions;
}
