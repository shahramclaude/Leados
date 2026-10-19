// src/lib/repositories/financeRepository.ts — typed reads over
// finance_snapshots_projection and the generic metric_values time series
// (used by the metrics forecast hot path).
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { financeSnapshotsProjection, metricValues } from "@/db/schema";

export type FinanceSnapshotRow = typeof financeSnapshotsProjection.$inferSelect;
export type MetricValueRow = typeof metricValues.$inferSelect;

export async function latestFinanceSnapshot(): Promise<FinanceSnapshotRow | null> {
  const [row] = await db.select().from(financeSnapshotsProjection).orderBy(desc(financeSnapshotsProjection.ts)).limit(1);
  return row ?? null;
}

export async function listFinanceSnapshots(limit = 90): Promise<FinanceSnapshotRow[]> {
  return db.select().from(financeSnapshotsProjection).orderBy(desc(financeSnapshotsProjection.ts)).limit(limit);
}

export async function getMetricSeries(metricKey: string, sinceDays = 180): Promise<MetricValueRow[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  // Uses the composite (metric_key, ts) index — see docs/DATA.md "Hot path
  // query plans" for the EXPLAIN output proving this is an index scan, not
  // a sequential scan over the whole time series table.
  return db
    .select()
    .from(metricValues)
    .where(and(eq(metricValues.metricKey, metricKey), gte(metricValues.ts, since)))
    .orderBy(asc(metricValues.ts))
    .limit(5000);
}

export async function listMetricKeys(): Promise<string[]> {
  const rows = await db.selectDistinct({ metricKey: metricValues.metricKey }).from(metricValues);
  return rows.map((r) => r.metricKey);
}
