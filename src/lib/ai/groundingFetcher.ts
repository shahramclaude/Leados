// =============================================================================
// LEADOS — Part 11: deterministic grounding fetchers
// =============================================================================
// These functions run BEFORE any LLM call. They are plain SQL (via Drizzle),
// fully deterministic, and define the universe of facts a generation is
// allowed to talk about. The LLM (or the deterministic composer) never
// invents evidence — it only composes prose over what these functions return.
// =============================================================================

import { db } from "@/db";
import { entities, events, metrics } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import type { EntityRef, EventRef, GroundingSet, MetricRef } from "./types";

export interface TimeframeInput {
  start: Date;
  end: Date;
}

function toMetricRef(row: typeof metrics.$inferSelect, entityName: string | null): MetricRef {
  const value = Number(row.value);
  const previousValue = row.previousValue !== null ? Number(row.previousValue) : null;
  const deltaAbs = previousValue !== null ? Number((value - previousValue).toFixed(4)) : null;
  const deltaPct = previousValue !== null && previousValue !== 0 ? Number((((value - previousValue) / Math.abs(previousValue)) * 100).toFixed(2)) : null;
  return {
    kind: "metric",
    ref: `metric:${row.id}`,
    id: row.id,
    name: row.name,
    value,
    previousValue,
    unit: row.unit,
    entityId: row.entityId,
    entityName,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    deltaAbs,
    deltaPct,
  };
}

function toEventRef(row: typeof events.$inferSelect, entityName: string | null): EventRef {
  return {
    kind: "event",
    ref: `event:${row.id}`,
    id: row.id,
    title: row.title,
    type: row.type,
    entityId: row.entityId,
    entityName,
    occurredAt: row.occurredAt.toISOString(),
    importance: row.importance,
    description: row.description,
  };
}

function toEntityRef(row: typeof entities.$inferSelect): EntityRef {
  return { kind: "entity", ref: `entity:${row.id}`, id: row.id, name: row.name, type: row.type };
}

/**
 * Fetch the full "delta grounding set" for an org within a timeframe: all
 * metrics whose period falls inside the window AND changed vs. previousValue,
 * plus all events that occurred inside the window. This is the deterministic
 * basis for the Daily Briefing ("real deltas only").
 */
export async function fetchDeltaGroundingSet(orgId: number, timeframe: TimeframeInput, topic?: string): Promise<GroundingSet> {
  const entityRows = await db.select().from(entities).where(eq(entities.orgId, orgId));
  const entityNameById = new Map(entityRows.map((e) => [e.id, e.name]));

  const metricRows = await db
    .select()
    .from(metrics)
    .where(and(eq(metrics.orgId, orgId), gte(metrics.periodEnd, timeframe.start), lte(metrics.periodEnd, timeframe.end)));

  const eventRows = await db
    .select()
    .from(events)
    .where(and(eq(events.orgId, orgId), gte(events.occurredAt, timeframe.start), lte(events.occurredAt, timeframe.end)));

  const changedMetrics = metricRows.filter((m) => m.previousValue !== null && Number(m.previousValue) !== Number(m.value));

  return {
    orgId,
    topic,
    timeframe: { start: timeframe.start.toISOString(), end: timeframe.end.toISOString() },
    entities: entityRows.map(toEntityRef),
    events: eventRows.map((e) => toEventRef(e, e.entityId ? entityNameById.get(e.entityId) ?? null : null)),
    metrics: changedMetrics.map((m) => toMetricRef(m, m.entityId ? entityNameById.get(m.entityId) ?? null : null)),
    documents: [],
  };
}

/**
 * Fetch a broader grounding set for Ask-LEADOS / insight synthesis: all
 * entities/events/metrics for the org (document retrieval is layered on top
 * by ragRetrieval.ts). Deliberately includes unchanged metrics too, since a
 * question might ask about a steady-state value, not just a delta.
 */
export async function fetchFullGroundingSet(orgId: number, timeframe: TimeframeInput, topic?: string): Promise<GroundingSet> {
  const entityRows = await db.select().from(entities).where(eq(entities.orgId, orgId));
  const entityNameById = new Map(entityRows.map((e) => [e.id, e.name]));

  const metricRows = await db
    .select()
    .from(metrics)
    .where(and(eq(metrics.orgId, orgId), gte(metrics.periodEnd, timeframe.start), lte(metrics.periodEnd, timeframe.end)));

  const eventRows = await db
    .select()
    .from(events)
    .where(and(eq(events.orgId, orgId), gte(events.occurredAt, timeframe.start), lte(events.occurredAt, timeframe.end)));

  return {
    orgId,
    topic,
    timeframe: { start: timeframe.start.toISOString(), end: timeframe.end.toISOString() },
    entities: entityRows.map(toEntityRef),
    events: eventRows.map((e) => toEventRef(e, e.entityId ? entityNameById.get(e.entityId) ?? null : null)),
    metrics: metricRows.map((m) => toMetricRef(m, m.entityId ? entityNameById.get(m.entityId) ?? null : null)),
    documents: [],
  };
}

/** Narrow a GroundingSet down to items relevant to a keyword/entity filter (used by Ask-LEADOS after retrieval). */
export function narrowGroundingSet(set: GroundingSet, keywords: string[]): GroundingSet {
  const lowered = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  if (lowered.length === 0) return set;
  const matches = (text: string) => lowered.some((k) => text.toLowerCase().includes(k));
  return {
    ...set,
    entities: set.entities.filter((e) => matches(e.name) || matches(e.type)),
    events: set.events.filter((e) => matches(e.title) || (e.entityName ? matches(e.entityName) : false) || matches(e.type)),
    metrics: set.metrics.filter((m) => matches(m.name) || (m.entityName ? matches(m.entityName) : false)),
  };
}
