import "server-only";
import { and, asc, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { findings, type FindingRow } from "@/db/schema";

export type FindingStatus = FindingRow["status"];
export type FindingSort = "newest" | "oldest" | "severity";

export interface FindingFilters {
  status?: FindingStatus;
  domain?: string;
  search?: string;
  sort?: FindingSort;
  page?: number;
  pageSize?: number;
}

export async function listFindings(filters: FindingFilters = {}) {
  const pageSize = Math.min(filters.pageSize ?? 20, 100);
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  const clauses: SQL[] = [];
  if (filters.status) clauses.push(eq(findings.status, filters.status));
  if (filters.domain) clauses.push(eq(findings.domain, filters.domain));
  if (filters.search) clauses.push(ilike(findings.title, `%${filters.search}%`));
  const where = clauses.length ? and(...clauses) : undefined;

  const orderBy =
    filters.sort === "oldest" ? asc(findings.createdAt) : filters.sort === "severity" ? desc(findings.severity) : desc(findings.createdAt);

  const [rows, [{ count }]] = await Promise.all([
    db.select().from(findings).where(where).orderBy(orderBy).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(findings).where(where),
  ]);

  return { rows, total: count, page, pageSize };
}

export async function getFinding(id: string): Promise<FindingRow | undefined> {
  const [row] = await db.select().from(findings).where(eq(findings.id, id)).limit(1);
  return row;
}

export async function createFinding(input: {
  title: string;
  summary?: string;
  domain?: string;
  team?: string;
  severity?: number;
}): Promise<FindingRow> {
  const [row] = await db
    .insert(findings)
    .values({
      title: input.title,
      summary: input.summary ?? "",
      domain: input.domain ?? "general",
      team: input.team ?? "Unassigned",
      severity: input.severity ?? 1,
    })
    .returning();
  return row;
}

export async function updateFindingStatus(id: string, status: FindingStatus): Promise<FindingRow | undefined> {
  const [row] = await db.update(findings).set({ status, updatedAt: new Date() }).where(eq(findings.id, id)).returning();
  return row;
}

export async function deleteFinding(id: string): Promise<boolean> {
  const rows = await db.delete(findings).where(eq(findings.id, id)).returning({ id: findings.id });
  return rows.length > 0;
}
