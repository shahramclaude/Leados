import "server-only";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { roster } from "@/db/schema";

export interface RosterFilters {
  team?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listRoster(filters: RosterFilters = {}) {
  const limit = Math.min(filters.limit ?? 100, 500);
  const offset = filters.offset ?? 0;

  const clauses: SQL[] = [];
  if (filters.team) clauses.push(eq(roster.team, filters.team));
  if (filters.search) {
    const needle = `%${filters.search}%`;
    const searchClause = or(ilike(roster.name, needle), ilike(roster.role, needle));
    if (searchClause) clauses.push(searchClause);
  }
  const where = clauses.length ? and(...clauses) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db.select().from(roster).where(where).orderBy(asc(roster.name)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(roster).where(where),
  ]);

  return { rows, total: count };
}
