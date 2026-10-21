// src/lib/narrativeIntel.ts
//
// Shared, deterministic read-model helpers over the `events` and `metrics`
// tables. No model calls happen here — every number is a direct query
// result. Consumed by institutionalMemory.ts (impactful-event distillation),
// livingDocs.ts (live block re-rendering), genome.ts and synthesis.ts.
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { entities, events, metrics } from "@/db/schema";

export type RecentEvent = {
  id: string;
  entityId: string | null;
  entityName: string | null;
  type: string;
  summary: string;
  occurredAt: string;
};

export async function getRecentEvents(lookbackDays = 30, entityId?: string): Promise<RecentEvent[]> {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  const rows = entityId
    ? await db.select().from(events).where(and(gte(events.occurredAt, since), eq(events.entityId, entityId))).orderBy(desc(events.occurredAt))
    : await db.select().from(events).where(gte(events.occurredAt, since)).orderBy(desc(events.occurredAt));

  const entityIds = Array.from(new Set(rows.map((r) => r.entityId).filter((v): v is string => Boolean(v))));
  const entityRows = entityIds.length > 0 ? await db.select().from(entities) : [];
  const nameById = new Map(entityRows.filter((e) => entityIds.includes(e.id)).map((e) => [e.id, e.name]));

  return rows.map((r) => ({
    id: r.id,
    entityId: r.entityId,
    entityName: r.entityId ? nameById.get(r.entityId) ?? null : null,
    type: r.type,
    summary: r.summary,
    occurredAt: r.occurredAt.toISOString(),
  }));
}

export type MetricDelta = {
  id: string;
  entityId: string | null;
  entityName: string | null;
  metricName: string;
  from: number;
  to: number;
  deltaPct: number;
  asOf: string;
};

/** For each (entity, metric name), compare the two most recent readings within the lookback window. */
export async function getMetricDeltas(lookbackDays = 30, entityId?: string): Promise<MetricDelta[]> {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  const rows = entityId
    ? await db.select().from(metrics).where(and(gte(metrics.asOf, since), eq(metrics.entityId, entityId))).orderBy(desc(metrics.asOf))
    : await db.select().from(metrics).where(gte(metrics.asOf, since)).orderBy(desc(metrics.asOf));

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.entityId ?? "none"}::${r.name}`;
    const group = groups.get(key) ?? [];
    group.push(r);
    groups.set(key, group);
  }

  const entityIds = Array.from(new Set(rows.map((r) => r.entityId).filter((v): v is string => Boolean(v))));
  const entityRows = entityIds.length > 0 ? await db.select().from(entities) : [];
  const nameById = new Map(entityRows.filter((e) => entityIds.includes(e.id)).map((e) => [e.id, e.name]));

  const deltas: MetricDelta[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [latest, prior] = group;
    const from = Number(prior.value);
    const to = Number(latest.value);
    const deltaPct = from === 0 ? 0 : ((to - from) / Math.abs(from)) * 100;
    deltas.push({
      id: latest.id,
      entityId: latest.entityId,
      entityName: latest.entityId ? nameById.get(latest.entityId) ?? null : null,
      metricName: latest.name,
      from,
      to,
      deltaPct,
      asOf: latest.asOf.toISOString(),
    });
  }
  return deltas;
}

/** Latest reading for a given metric name (optionally scoped to an entity) — the primitive live-doc blocks render from. */
export async function getLatestMetric(name: string, entityId?: string) {
  const rows = entityId
    ? await db.select().from(metrics).where(and(eq(metrics.name, name), eq(metrics.entityId, entityId))).orderBy(desc(metrics.asOf)).limit(1)
    : await db.select().from(metrics).where(eq(metrics.name, name)).orderBy(desc(metrics.asOf)).limit(1);
  return rows[0] ?? null;
}
