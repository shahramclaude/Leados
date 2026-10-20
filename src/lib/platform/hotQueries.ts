// LEADOS Part 01 — hot, dashboard-facing read queries.
//
// Three query families, each backed by a specific index. EXPLAIN ANALYZE
// output for all three (run against the seeded dataset) is pasted into
// docs/DATA.md, "Hot query EXPLAIN plans".
//
//  - getCockpit(orgId):   reads across multiple projectors' current state —
//                         backed by idx_projection_state_projector_org
//                         (projector_name, org_id).
//  - getTodayFeed(orgId): raw event feed for "what happened today" — backed
//                         by idx_events_org_occurred (org_id, occurred_at).
//                         Deliberately filters on occurredAt (valid time),
//                         NOT recordedAt: "today" means "things that
//                         happened today in the business", which is what a
//                         human means by the word. See docs/DATA.md,
//                         "occurredAt vs recordedAt" for the alternative
//                         (an ops-monitoring view) and why it is a different
//                         query, not a flag on this one.
//  - getMetricsDaily(orgId): per-day event counts by type — backed by
//                         idx_events_org_type_occurred (org_id, type,
//                         occurred_at).
//
// No raw `db.select()` outside src/lib/platform — this file, like the rest
// of the directory, is where that is allowed.

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, projectionState } from "@/db/schema";
import type { CockpitDTO, TodayFeedItemDTO } from "@/lib/events/clientTypes";

export async function getCockpit(orgId: string): Promise<CockpitDTO> {
  const [rosterRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(projectionState)
    .where(
      and(
        eq(projectionState.projectorName, "peopleRoster"),
        eq(projectionState.orgId, orgId),
        sql`(${projectionState.state}->>'erased')::boolean is not true`,
      ),
    );

  const [flightRiskRow] = await db
    .select({ highRisk: sql<number>`count(*)::int` })
    .from(projectionState)
    .where(
      and(
        eq(projectionState.projectorName, "peopleFlightRisk"),
        eq(projectionState.orgId, orgId),
        sql`${projectionState.state}->>'riskLevel' = 'high'`,
      ),
    );

  const [financeRow] = await db
    .select({ state: projectionState.state })
    .from(projectionState)
    .where(and(eq(projectionState.projectorName, "financeBurn"), eq(projectionState.entityId, orgId)))
    .limit(1);

  const [dealsRow] = await db
    .select({
      openDeals: sql<number>`count(*) filter (where ${projectionState.state}->>'stage' not in ('closed_won','closed_lost'))::int`,
      pipelineValueUsd: sql<number>`coalesce(sum((${projectionState.state}->>'amountUsd')::numeric) filter (where ${projectionState.state}->>'stage' not in ('closed_won','closed_lost')), 0)::float`,
    })
    .from(projectionState)
    .where(
      and(
        eq(projectionState.projectorName, "salesPipeline"),
        eq(projectionState.orgId, orgId),
        sql`${projectionState.state}->>'kind' = 'deal'`,
      ),
    );

  const [atRiskCustomersRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectionState)
    .where(
      and(
        eq(projectionState.projectorName, "salesPipeline"),
        eq(projectionState.orgId, orgId),
        sql`${projectionState.state}->>'kind' = 'customer'`,
        sql`(${projectionState.state}->>'healthScore')::numeric < 50`,
      ),
    );

  const [initiativesAtRiskRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectionState)
    .where(
      and(
        eq(projectionState.projectorName, "strategyInitiative"),
        eq(projectionState.orgId, orgId),
        sql`${projectionState.state}->>'status' in ('at_risk','off_track')`,
      ),
    );

  const financeState = (financeRow?.state as
    | { monthlyBurnUsd: number | null; cashOnHandUsd: number | null; runwayMonths: number | null }
    | undefined) ?? { monthlyBurnUsd: null, cashOnHandUsd: null, runwayMonths: null };

  return {
    orgId,
    generatedAt: new Date().toISOString(),
    people: {
      totalTracked: rosterRow?.total ?? 0,
      highFlightRisk: flightRiskRow?.highRisk ?? 0,
    },
    finance: {
      monthlyBurnUsd: financeState.monthlyBurnUsd,
      cashOnHandUsd: financeState.cashOnHandUsd,
      runwayMonths: financeState.runwayMonths,
    },
    sales: {
      openDeals: dealsRow?.openDeals ?? 0,
      pipelineValueUsd: dealsRow?.pipelineValueUsd ?? 0,
      atRiskCustomers: atRiskCustomersRow?.count ?? 0,
    },
    strategy: {
      initiativesAtRisk: initiativesAtRiskRow?.count ?? 0,
    },
  };
}

function summarize(type: string, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (type) {
    case "people.flight_risk_changed":
      return `Flight risk for ${p.personId} set to ${p.riskLevel}`;
    case "finance.burn_updated":
      return `Burn updated: $${p.monthlyBurnUsd}/mo, $${p.cashOnHandUsd} on hand`;
    case "sales.deal_stage_changed":
      return `Deal ${p.dealId} moved ${p.fromStage} -> ${p.toStage}`;
    default:
      return type;
  }
}

/** "What happened today" — filters on occurredAt (valid time). See module
 * header for why this is intentional. */
export async function getTodayFeed(orgId: string, limit = 50): Promise<TodayFeedItemDTO[]> {
  const startOfTodayUtc = new Date();
  startOfTodayUtc.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select({
      eventId: events.eventId,
      type: events.type,
      occurredAt: events.occurredAt,
      entityId: events.entityId,
      payload: events.payload,
    })
    .from(events)
    .where(and(eq(events.orgId, orgId), gte(events.occurredAt, startOfTodayUtc)))
    .orderBy(sql`${events.occurredAt} desc`)
    .limit(limit);

  return rows.map((r) => ({
    eventId: r.eventId,
    type: r.type,
    occurredAt: r.occurredAt.toISOString(),
    entityId: r.entityId,
    summary: summarize(r.type, r.payload),
  }));
}

export type DailyMetric = { day: string; type: string; count: number };

/** Daily event-count-by-type series, backed by idx_events_org_type_occurred. */
export async function getMetricsDaily(orgId: string, days = 30): Promise<DailyMetric[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${events.occurredAt}), 'YYYY-MM-DD')`,
      type: events.type,
      count: sql<number>`count(*)::int`,
    })
    .from(events)
    .where(and(eq(events.orgId, orgId), gte(events.occurredAt, since)))
    .groupBy(sql`1`, events.type)
    .orderBy(sql`1`);
  return rows;
}
