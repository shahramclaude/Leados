import { db } from "@/db";
import { forecasts, leads } from "@/db/schema";
import { getOrCreateDemoTenant } from "@/lib/tenant";
import { computeForecast, currentPeriod, isStage } from "@/lib/forecast";
import { appendDecision } from "@/lib/ledger";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Part 59 — Pipeline Forecasting & Revenue Attribution
// GET: list forecasts (most recent first), each joined with its lead.
// POST: compute and persist a fresh forecast for one lead (or every lead
// when `leadId` is omitted), writing a ledger entry per computed forecast.

export async function GET(request: Request) {
  const tenant = await getOrCreateDemoTenant();
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");

  const rows = await db
    .select({
      forecast: forecasts,
      lead: leads,
    })
    .from(forecasts)
    .innerJoin(leads, eq(forecasts.leadId, leads.id))
    .where(
      period
        ? and(eq(forecasts.tenantId, tenant.id), eq(forecasts.period, period))
        : eq(forecasts.tenantId, tenant.id),
    )
    .orderBy(desc(forecasts.createdAt));

  return Response.json({ forecasts: rows });
}

export async function POST(request: Request) {
  const tenant = await getOrCreateDemoTenant();
  const body = await request.json().catch(() => ({}));
  const period = typeof body.period === "string" && body.period ? body.period : currentPeriod();

  const targetLeads = body.leadId
    ? await db
        .select()
        .from(leads)
        .where(and(eq(leads.id, body.leadId), eq(leads.tenantId, tenant.id)))
    : await db.select().from(leads).where(eq(leads.tenantId, tenant.id));

  if (body.leadId && targetLeads.length === 0) {
    return Response.json({ error: "Lead not found" }, { status: 404 });
  }

  const created = [];

  for (const lead of targetLeads) {
    const stage = isStage(lead.stage) ? lead.stage : "new";
    const result = computeForecast({
      stage,
      score: lead.score,
      dealValue: Number(lead.dealValue),
    });

    const [forecast] = await db
      .insert(forecasts)
      .values({
        tenantId: tenant.id,
        leadId: lead.id,
        period,
        stageAtForecast: stage,
        scoreAtForecast: lead.score,
        probability: String(result.probability),
        dealValue: String(Number(lead.dealValue)),
        weightedValue: String(result.weightedValue),
        method: result.method,
        rationale: result.rationale,
      })
      .returning();

    await appendDecision({
      tenantId: tenant.id,
      entityType: "forecast",
      entityId: forecast.id,
      action: "forecast.computed",
      payload: {
        leadId: lead.id,
        period,
        probability: result.probability,
        weightedValue: result.weightedValue,
      },
      rationale: `Forecast computed for lead "${lead.name}" (${period}): ${result.rationale}`,
    });

    created.push(forecast);
  }

  return Response.json({ forecasts: created }, { status: 201 });
}
