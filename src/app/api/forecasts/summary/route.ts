import { db } from "@/db";
import { forecasts, leads } from "@/db/schema";
import { getOrCreateDemoTenant } from "@/lib/tenant";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Part 59 — aggregates the most recent forecast per lead into a pipeline
// summary: total weighted value, breakdown by period, and breakdown by
// stage-at-forecast. "Most recent per lead" is computed in-process rather
// than with a window-function query, which is fine at demo scale.

export async function GET() {
  const tenant = await getOrCreateDemoTenant();

  const rows = await db
    .select({ forecast: forecasts, lead: leads })
    .from(forecasts)
    .innerJoin(leads, eq(forecasts.leadId, leads.id))
    .where(eq(forecasts.tenantId, tenant.id));

  const latestByLead = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = latestByLead.get(row.forecast.leadId);
    if (!existing || row.forecast.createdAt > existing.forecast.createdAt) {
      latestByLead.set(row.forecast.leadId, row);
    }
  }

  const latest = Array.from(latestByLead.values());

  const totalWeightedValue = latest.reduce(
    (sum, r) => sum + Number(r.forecast.weightedValue),
    0,
  );
  const totalDealValue = latest.reduce((sum, r) => sum + Number(r.forecast.dealValue), 0);

  const byPeriod: Record<string, number> = {};
  const byStage: Record<string, number> = {};

  for (const r of latest) {
    byPeriod[r.forecast.period] = (byPeriod[r.forecast.period] ?? 0) + Number(r.forecast.weightedValue);
    byStage[r.forecast.stageAtForecast] =
      (byStage[r.forecast.stageAtForecast] ?? 0) + Number(r.forecast.weightedValue);
  }

  return Response.json({
    leadsForecast: latest.length,
    totalDealValue: round2(totalDealValue),
    totalWeightedValue: round2(totalWeightedValue),
    byPeriod,
    byStage,
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
