// src/app/api/financial/route.ts
//
// GET /api/financial — full Financial Intelligence Report: Monte Carlo
// runway distribution, unit economics, fundraising readiness, the
// belief-fabric financial-risk posterior, and an aggregate health score.
//
// PROVENANCE: metric_defs/metric_values/decisions/events tables are a
// from-scratch reconstruction for this sandbox (see src/db/schema.ts
// header) since Parts 1-4 were not present here. On first call with an
// empty metric store this route seeds a small, clearly-labeled demo
// dataset so the Financial Nervous System has something real to simulate
// against; in a real deployment this seeding would be replaced by actual
// ingestion pipelines from prior parts.

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { decisions, events, metricDefs, metricValues } from "@/db/schema";
import {
  computeFinancialHealthScore,
  computeFundraisingReadiness,
  computeUnitEconomics,
  runMonteCarloRunway,
} from "@/lib/financialOS";
import { computeFinancialRiskPosterior } from "@/lib/beliefFabric";
import type {
  Decision,
  DecisionLevel,
  FinancialEvent,
  FinancialIntelligenceReport,
  MetricDefRecord,
  MetricSnapshot,
  MetricValueRecord,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const DEMO_METRIC_DEFS: { key: string; label: string; unit: string; category: string }[] = [
  { key: "cash_balance", label: "Cash Balance", unit: "USD", category: "financial" },
  { key: "burn_rate", label: "Gross Monthly Burn", unit: "USD/mo", category: "financial" },
  { key: "monthly_revenue", label: "Monthly Revenue", unit: "USD/mo", category: "financial" },
  { key: "customer_count", label: "Customer Count", unit: "customers", category: "growth" },
  { key: "churn_rate", label: "Monthly Churn Rate", unit: "fraction", category: "growth" },
  { key: "cac", label: "Customer Acquisition Cost", unit: "USD", category: "unit_economics" },
  { key: "gross_margin", label: "Gross Margin", unit: "%", category: "unit_economics" },
  { key: "net_burn", label: "Net Burn", unit: "USD/mo", category: "financial" },
  { key: "new_arr", label: "New ARR (monthly)", unit: "USD/mo", category: "growth" },
  { key: "org_health_score", label: "Org Health Score", unit: "score", category: "org" },
  { key: "team_size", label: "Team Size", unit: "people", category: "org" },
];

/** Ensures a minimal, clearly-labeled demo dataset exists so the Financial
 * Nervous System has something to compute against on a fresh database. */
async function ensureSeedData(): Promise<void> {
  const existing = await db.select({ key: metricDefs.key }).from(metricDefs).limit(1);
  if (existing.length > 0) return;

  await db.insert(metricDefs).values(DEMO_METRIC_DEFS);

  const now = new Date();
  const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  await db.insert(metricValues).values([
    { metricKey: "cash_balance", value: 2_400_000, recordedAt: now, source: "seed_demo" },
    { metricKey: "burn_rate", value: 180_000, recordedAt: now, source: "seed_demo" },
    { metricKey: "monthly_revenue", value: 100_000, recordedAt: twoMonthsAgo, source: "seed_demo" },
    { metricKey: "monthly_revenue", value: 103_000, recordedAt: now, source: "seed_demo" },
    { metricKey: "customer_count", value: 850, recordedAt: now, source: "seed_demo" },
    { metricKey: "churn_rate", value: 0.03, recordedAt: now, source: "seed_demo" },
    { metricKey: "cac", value: 1200, recordedAt: now, source: "seed_demo" },
    { metricKey: "gross_margin", value: 72, recordedAt: now, source: "seed_demo" },
    { metricKey: "net_burn", value: 77_000, recordedAt: now, source: "seed_demo" },
    { metricKey: "new_arr", value: 36_000, recordedAt: now, source: "seed_demo" },
    { metricKey: "org_health_score", value: 68, recordedAt: now, source: "seed_demo" },
    { metricKey: "team_size", value: 24, recordedAt: now, source: "seed_demo" },
  ]);

  await db.insert(decisions).values([
    {
      title: "Approve extended seed extension bridge terms",
      level: "board",
      cycleTimeDays: 5,
      decidedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
    },
    {
      title: "Approve Q3 hiring plan",
      level: "exec",
      cycleTimeDays: 9,
      decidedAt: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000),
    },
  ]);
}

async function latestValue(key: string, fallback: number): Promise<number> {
  const rows = await db
    .select({ value: metricValues.value })
    .from(metricValues)
    .where(eq(metricValues.metricKey, key))
    .orderBy(desc(metricValues.recordedAt))
    .limit(1);
  return rows.length > 0 ? rows[0].value : fallback;
}

export async function GET() {
  try {
    await ensureSeedData();

    const [defRows, valueRows, decisionRows, eventRows] = await Promise.all([
      db.select().from(metricDefs),
      db.select().from(metricValues),
      db.select().from(decisions).orderBy(desc(decisions.decidedAt)).limit(20),
      db.select().from(events).orderBy(desc(events.occurredAt)).limit(200),
    ]);

    const metricDefRecords: MetricDefRecord[] = defRows.map((d) => ({
      key: d.key,
      label: d.label,
      unit: d.unit,
      category: d.category,
    }));

    const metricValueRecords: MetricValueRecord[] = valueRows.map((v) => ({
      metricKey: v.metricKey,
      value: v.value,
      recordedAt: v.recordedAt.toISOString(),
    }));

    const financialEvents: FinancialEvent[] = eventRows.map((e) => ({
      type: e.type,
      payload: (e.payload as Record<string, unknown>) ?? {},
      occurredAt: e.occurredAt.toISOString(),
    }));

    const recentDecisions: Decision[] = decisionRows.map((d) => ({
      id: d.id,
      title: d.title,
      level: d.level as DecisionLevel,
      cycleTimeDays: d.cycleTimeDays,
      decidedAt: d.decidedAt.toISOString(),
    }));

    // Inputs for the Monte Carlo runway model. Falls back to design
    // defaults (documented inline) when a metric has never been recorded.
    const cashBalance = await latestValue("cash_balance", 1_800_000);
    const burnRate = await latestValue("burn_rate", 150_000);
    const revenue = await latestValue("monthly_revenue", 0);
    const orgHealthScore = await latestValue("org_health_score", 60);
    const teamSize = await latestValue("team_size", 10);

    const runway = runMonteCarloRunway({
      cashBalance,
      burnRate,
      revenue,
      paths: 5000,
      maxMonths: 60,
      seedKey: String(cashBalance),
    });

    const unitEconomics = computeUnitEconomics(
      financialEvents,
      metricValueRecords,
      metricDefRecords
    );

    const financialRiskPosterior = computeFinancialRiskPosterior({
      runwayP50: runway.p50,
      ltvCacRatio: unitEconomics.ltvCacRatio,
      burnMultiple: unitEconomics.burnMultiple,
      probabilityCritical: runway.probabilityCritical,
    });

    const fundraisingReadiness = computeFundraisingReadiness(
      runway,
      unitEconomics,
      orgHealthScore,
      teamSize,
      recentDecisions
    );

    const financialHealthScore = computeFinancialHealthScore(
      runway.p50,
      unitEconomics.ltvCacRatio,
      unitEconomics.burnMultiple,
      financialRiskPosterior
    );

    const latestMetrics: Record<string, MetricSnapshot> = {};
    for (const def of metricDefRecords) {
      const series = metricValueRecords
        .filter((v) => v.metricKey === def.key)
        .sort(
          (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
        );
      const latest = series[series.length - 1];
      latestMetrics[def.key] = {
        key: def.key,
        label: def.label,
        unit: def.unit,
        value: latest ? latest.value : null,
        recordedAt: latest ? latest.recordedAt : null,
      };
    }

    const report: FinancialIntelligenceReport = {
      runway,
      unitEconomics,
      fundraisingReadiness,
      financialRiskPosterior,
      financialHealthScore,
      latestMetrics,
      generatedAt: new Date().toISOString(),
    };

    return Response.json(report);
  } catch (error) {
    console.error("GET /api/financial failed", error);
    return Response.json(
      { error: "Failed to compute financial intelligence report." },
      { status: 500 }
    );
  }
}


