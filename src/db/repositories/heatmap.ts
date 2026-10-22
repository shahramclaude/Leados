/**
 * src/db/repositories/heatmap.ts
 *
 * Single aggregated SQL query (GROUP BY day) backed by
 * `decisions_tenant_occurred_idx` — see docs/PERFORMANCE.md for the
 * EXPLAIN ANALYZE before/after. This is the single most expensive query in
 * the app at 10x scale (50k decision rows/tenant), so its result is served
 * through the shared `StaleCache` (src/lib/staleCache.ts) rather than
 * recomputed on every dashboard paint.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { decisions } from "@/db/schema";
import { StaleCache } from "@/lib/staleCache";

export interface HeatmapCell {
  day: string; // YYYY-MM-DD
  count: number;
  avgImpact: number;
}

const heatmapCache = new StaleCache<HeatmapCell[]>(60_000);

async function queryHeatmap(tenantId: string, days: number): Promise<HeatmapCell[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${decisions.occurredAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`,
      avgImpact: sql<number>`coalesce(avg(${decisions.impact}), 0)`,
    })
    .from(decisions)
    .where(and(eq(decisions.tenantId, tenantId), gte(decisions.occurredAt, since)))
    .groupBy(sql`date_trunc('day', ${decisions.occurredAt})`)
    .orderBy(sql`date_trunc('day', ${decisions.occurredAt})`);

  return rows.map((r) => ({ day: r.day, count: Number(r.count), avgImpact: Number(r.avgImpact) }));
}

export async function getHeatmap(tenantId: string, days = 365) {
  return heatmapCache.getOrCompute(`${tenantId}:${days}`, () => queryHeatmap(tenantId, days));
}
