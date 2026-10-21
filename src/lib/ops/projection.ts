// `projection_org_stats` is the one read-model derived from `event_log`.
// `refreshProjection` is idempotent and safe to run from a scheduled job or
// `npm run db:rebuild`. Lag between the event log's latest row and this
// projection's `updatedAt` is the data-freshness SLO measurement.
import { db } from "@/db";
import { eventLog, projectionOrgStats } from "@/db/schema";
import { sql } from "drizzle-orm";
import { withDbSpan } from "@/lib/obs/tracing";

export async function refreshProjection() {
  return withDbSpan("projection.refresh", async () => {
    const [{ count, maxSeq }] = (
      await db.execute(sql`select count(*)::int as count, coalesce(max(seq), 0)::bigint as "maxSeq" from event_log`)
    ).rows as { count: number; maxSeq: number }[];
    const byTypeRows = (
      await db.execute(sql`select event_type, count(*)::int as n from event_log group by event_type`)
    ).rows as { event_type: string; n: number }[];
    const byType = Object.fromEntries(byTypeRows.map((r) => [r.event_type, r.n]));

    await db
      .insert(projectionOrgStats)
      .values({ id: "global", eventCount: count, lastEventSeq: Number(maxSeq), byType, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: projectionOrgStats.id,
        set: { eventCount: count, lastEventSeq: Number(maxSeq), byType, updatedAt: new Date() },
      });
    return { eventCount: count, lastEventSeq: Number(maxSeq) };
  });
}

export async function projectionLagSeconds(): Promise<{ lagSeconds: number | null; behindEvents: number }> {
  const [proj] = await db.select().from(projectionOrgStats).where(sql`id = 'global'`).limit(1);
  const [{ maxSeq }] = (await db.execute(sql`select coalesce(max(seq), 0)::bigint as "maxSeq" from event_log`)).rows as {
    maxSeq: number;
  }[];
  if (!proj) return { lagSeconds: null, behindEvents: Number(maxSeq) };
  const lagSeconds = (Date.now() - proj.updatedAt.getTime()) / 1000;
  return { lagSeconds, behindEvents: Math.max(0, Number(maxSeq) - proj.lastEventSeq) };
}

// Minimal use of eventLog export to keep the import honest/typed even though
// writes happen via eventBus.ts — re-exported for scripts/db:rebuild.
export { eventLog };
