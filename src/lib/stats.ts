import { db } from "@/db";
import { sql } from "drizzle-orm";
import { linearRegression, mean, stdDev } from "./mathUtils";

export type DailyBucket = {
  day: string; // ISO date (yyyy-mm-dd)
  total: number;
  critical: number;
  warning: number;
  info: number;
  value: number;
};

/**
 * Aggregates events into daily buckets using a single indexed SQL query
 * (GROUP BY day) instead of pulling raw rows into Node and reducing in JS.
 * Uses events_occurred_at_id_idx via the range filter on occurred_at.
 */
export async function getDailyBuckets(days: number): Promise<DailyBucket[]> {
  const result = await db.execute<{
    day: string;
    total: string;
    critical: string;
    warning: string;
    info: string;
    value: string;
  }>(sql`
    select
      to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') as day,
      count(*)::bigint as total,
      count(*) filter (where severity = 'critical')::bigint as critical,
      count(*) filter (where severity = 'warning')::bigint as warning,
      count(*) filter (where severity = 'info')::bigint as info,
      coalesce(sum(value), 0) as value
    from events
    where occurred_at >= now() - (${days} || ' days')::interval
    group by 1
    order by 1 asc
  `);

  return result.rows.map((row) => ({
    day: row.day,
    total: Number(row.total),
    critical: Number(row.critical),
    warning: Number(row.warning),
    info: Number(row.info),
    value: Number(row.value),
  }));
}

/** Cheap, deterministic trend projection used for the fast/SSR forecast. */
export function projectTrend(buckets: DailyBucket[], horizonDays: number) {
  const xs = buckets.map((_, i) => i);
  const ys = buckets.map((b) => b.total);
  const { slope, intercept } = linearRegression(xs, ys);
  const history = buckets.map((b) => b.total);
  const residuals = history.map((y, i) => y - (slope * i + intercept));
  const noise = stdDev(residuals) || Math.max(1, mean(history) * 0.1);

  const projected: { day: number; expected: number; low: number; high: number }[] = [];
  for (let d = 0; d < horizonDays; d++) {
    const x = xs.length + d;
    const expected = Math.max(0, slope * x + intercept);
    projected.push({
      day: d + 1,
      expected,
      low: Math.max(0, expected - 1.64 * noise),
      high: expected + 1.64 * noise,
    });
  }

  return { slope, intercept, noise, projected };
}

export async function getEventCount(): Promise<number> {
  const result = await db.execute<{ count: string }>(sql`select count(*)::bigint as count from events`);
  return Number(result.rows[0]?.count ?? 0);
}

export async function getLatestEventId(): Promise<number> {
  const result = await db.execute<{ id: string | null }>(sql`select max(id) as id from events`);
  return Number(result.rows[0]?.id ?? 0);
}
