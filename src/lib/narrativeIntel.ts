// narrativeIntel.ts — gathers structured inputs (metric deltas, recent
// events, open findings) for narrative synthesis. Pure data access + math;
// no model calls. synthesis.ts, livingDocs.ts and briefing.ts all read from
// here so the "what happened" facts are computed exactly once and the same
// way everywhere.
import { db } from "@/db";
import { entities, events, metrics, findings } from "@/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";

export type MetricDelta = {
  id: string;
  entityId: string | null;
  entityName: string;
  metricName: string;
  from: number;
  to: number;
  deltaPct: number;
  asOf: string;
};

export type RecentEvent = {
  id: string;
  entityId: string | null;
  entityName: string | null;
  type: string;
  summary: string;
  occurredAt: string;
};

export async function getRecentEvents(sinceDays: number, entityId?: string): Promise<RecentEvent[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await db
    .select({
      id: events.id,
      entityId: events.entityId,
      entityName: entities.name,
      type: events.type,
      summary: events.summary,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .leftJoin(entities, eq(events.entityId, entities.id))
    .where(and(gte(events.occurredAt, since), entityId ? eq(events.entityId, entityId) : undefined))
    .orderBy(desc(events.occurredAt))
    .limit(50);

  return rows.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() }));
}

export async function getMetricDeltas(sinceDays: number, entityId?: string): Promise<MetricDelta[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await db
    .select({
      id: metrics.id,
      entityId: metrics.entityId,
      entityName: entities.name,
      metricName: metrics.name,
      value: metrics.value,
      asOf: metrics.asOf,
    })
    .from(metrics)
    .leftJoin(entities, eq(metrics.entityId, entities.id))
    .where(entityId ? eq(metrics.entityId, entityId) : undefined)
    .orderBy(desc(metrics.asOf));

  // Group by (entityId, metricName), compare latest value in-window to the
  // most recent value before the window started.
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.entityId ?? "org"}::${r.metricName}`;
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }

  const deltas: MetricDelta[] = [];
  for (const [, series] of byKey) {
    const inWindow = series.filter((r) => r.asOf >= since);
    const before = series.filter((r) => r.asOf < since);
    if (inWindow.length === 0) continue;
    const latest = inWindow[0];
    const baseline = before[0] ?? inWindow[inWindow.length - 1];
    const from = Number(baseline.value);
    const to = Number(latest.value);
    const deltaPct = from === 0 ? 0 : ((to - from) / Math.abs(from)) * 100;
    deltas.push({
      id: latest.id,
      entityId: latest.entityId,
      entityName: latest.entityName ?? "Org-wide",
      metricName: latest.metricName,
      from,
      to,
      deltaPct,
      asOf: latest.asOf.toISOString(),
    });
  }
  return deltas.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
}

export async function getOpenFindings() {
  return db.select().from(findings).where(eq(findings.status, "open")).orderBy(desc(findings.createdAt)).limit(20);
}
