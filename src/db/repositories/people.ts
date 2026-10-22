/**
 * src/db/repositories/people.ts
 *
 * N+1 fix (Phase 0 finding, see docs/PERFORMANCE.md): the naive
 * implementation fetches a page of people, then for each row issues a
 * `SELECT * FROM people WHERE id = $managerId` to resolve the manager's
 * name — 25 extra round trips per page. `listPeoplePage` instead does the
 * page query once, then ONE batched `WHERE id = ANY($managerIds)` query to
 * resolve every manager name in the page, regardless of page size.
 *
 * The total-count and the page rows are also fetched in a single query via
 * `count(*) over()` instead of two sequential queries, eliminating that
 * waterfall as well.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { MAX_PAGE_SIZE, type Page } from "./pagination";

export interface PersonRow {
  id: string;
  name: string;
  role: string;
  team: string;
  riskScore: number;
  managerId: string | null;
  managerName: string | null;
  createdAt: string;
}

export async function listPeoplePage(
  tenantId: string,
  { limit, offset, team }: { limit: number; offset: number; team?: string },
): Promise<Page<PersonRow>> {
  const cappedLimit = Math.min(limit, MAX_PAGE_SIZE);

  const whereClause = team ? and(eq(people.tenantId, tenantId), eq(people.team, team)) : eq(people.tenantId, tenantId);

  const rows = await db
    .select({
      id: people.id,
      name: people.name,
      role: people.role,
      team: people.team,
      riskScore: people.riskScore,
      managerId: people.managerId,
      createdAt: people.createdAt,
      total: sql<number>`count(*) over()`,
    })
    .from(people)
    .where(whereClause)
    .orderBy(desc(people.createdAt), desc(people.id))
    .limit(cappedLimit)
    .offset(offset);

  const total = rows[0]?.total ?? 0;

  // Batch loader: one extra query total for the whole page, not one per row.
  const managerIds = [...new Set(rows.map((r) => r.managerId).filter((id): id is string => !!id))];
  const managers = managerIds.length
    ? await db.select({ id: people.id, name: people.name }).from(people).where(inArray(people.id, managerIds))
    : [];
  const managerNameById = new Map(managers.map((m) => [m.id, m.name]));

  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      team: r.team,
      riskScore: r.riskScore,
      managerId: r.managerId,
      managerName: r.managerId ? managerNameById.get(r.managerId) ?? null : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })),
    limit: cappedLimit,
    offset,
    total: Number(total),
    hasMore: offset + rows.length < Number(total),
  };
}

export async function tenantHeadcountAndRisk(tenantId: string): Promise<{ headcount: number; avgRisk: number }> {
  const row = await db
    .select({ headcount: sql<number>`count(*)`, avgRisk: sql<number>`coalesce(avg(${people.riskScore}), 0)` })
    .from(people)
    .where(eq(people.tenantId, tenantId));
  return { headcount: Number(row[0]?.headcount ?? 0), avgRisk: Number(row[0]?.avgRisk ?? 0) };
}
