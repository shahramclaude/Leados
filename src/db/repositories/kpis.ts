/**
 * src/db/repositories/kpis.ts
 * Three independent, index-backed aggregate queries for the cockpit KPI
 * strip. The page fetches them with Promise.all (see src/app/cockpit/page.tsx)
 * instead of sequentially — a waterfall of 3 round trips at ~5-15ms each is a
 * small but real and completely avoidable tax on every page load.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { decisions, relationships } from "@/db/schema";

export async function countRecentDecisions(tenantId: string, days = 90): Promise<number> {
  const since = new Date(Date.now() - days * 86_400_000);
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(decisions)
    .where(and(eq(decisions.tenantId, tenantId), gte(decisions.occurredAt, since)));
  return Number(row[0]?.count ?? 0);
}

export async function countRelationships(tenantId: string): Promise<number> {
  const row = await db.select({ count: sql<number>`count(*)` }).from(relationships).where(eq(relationships.tenantId, tenantId));
  return Number(row[0]?.count ?? 0);
}
