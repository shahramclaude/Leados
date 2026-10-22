// src/lib/appetite.ts
//
// Risk appetite engine: per-metric thresholds (sourced from "Part 08"
// finance outputs / "Part 06" twin outputs — not present in this sandbox,
// so `source` is recorded as provenance metadata rather than a live feed)
// compared against observed actuals, producing green/amber/red status and
// raising Findings -> (optionally) Part 23 decisions on breach.

import { db } from "@/db";
import { appetiteMetrics, appetiteObservations } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { createFinding } from "./findings";
import { appendAuditEvent } from "./audit";

export type AppetiteStatus = "green" | "amber" | "red";

export interface AppetiteMetricDefinition {
  code: string;
  name: string;
  unit: "currency" | "percent" | "count" | "days";
  thresholdAmber: number;
  thresholdRed: number;
  direction: "above" | "below";
  linkedRiskIds?: number[];
  source?: string;
}

export async function createAppetiteMetric(def: AppetiteMetricDefinition) {
  const [row] = await db
    .insert(appetiteMetrics)
    .values({
      code: def.code,
      name: def.name,
      unit: def.unit,
      thresholdAmber: def.thresholdAmber.toString(),
      thresholdRed: def.thresholdRed.toString(),
      direction: def.direction,
      linkedRiskIds: def.linkedRiskIds ?? [],
      source: def.source ?? "part08-finance",
    })
    .returning();
  return row;
}

export async function listAppetiteMetrics() {
  return db.select().from(appetiteMetrics);
}

export function evaluateStatus(value: number, amber: number, red: number, direction: "above" | "below"): AppetiteStatus {
  if (direction === "above") {
    if (value >= red) return "red";
    if (value >= amber) return "amber";
    return "green";
  } else {
    if (value <= red) return "red";
    if (value <= amber) return "amber";
    return "green";
  }
}

/**
 * Record a new observation for a metric; if it breaches (amber or red),
 * raise a Finding so it can flow into Part 23 decisions. Returns the
 * observation row plus the finding id if one was raised.
 */
export async function recordAppetiteObservation(metricId: number, value: number, actor = "appetite-engine") {
  const [metric] = await db.select().from(appetiteMetrics).where(eq(appetiteMetrics.id, metricId));
  if (!metric) throw new Error(`appetite metric ${metricId} not found`);

  const status = evaluateStatus(
    value,
    Number(metric.thresholdAmber),
    Number(metric.thresholdRed),
    metric.direction as "above" | "below",
  );

  let findingId: number | null = null;
  if (status !== "green") {
    const finding = await createFinding({
      title: `Appetite breach (${status.toUpperCase()}): ${metric.name}`,
      severity: status === "red" ? "critical" : "medium",
      sourceType: "appetite_breach",
      sourceRef: String(metric.id),
      description: `Observed value ${value}${metric.unit === "percent" ? "%" : ""} ${
        metric.direction === "above" ? "exceeds" : "is below"
      } the ${status} threshold (${status === "red" ? metric.thresholdRed : metric.thresholdAmber}) for metric ${metric.code} (${metric.name}). Source of threshold: ${metric.source}.`,
    });
    findingId = finding.id;
    await appendAuditEvent({
      category: "appetite_breach",
      entityType: "appetite_metric",
      entityId: String(metric.id),
      action: "appetite_breach_detected",
      payload: { value, status, thresholdAmber: metric.thresholdAmber, thresholdRed: metric.thresholdRed, findingId },
      actor,
    });
  }

  const [obs] = await db
    .insert(appetiteObservations)
    .values({ metricId, value: value.toString(), status, findingId })
    .returning();

  return { observation: obs, status, findingId };
}

export async function latestObservations() {
  const metrics = await db.select().from(appetiteMetrics);
  const out = [];
  for (const m of metrics) {
    const [latest] = await db
      .select()
      .from(appetiteObservations)
      .where(eq(appetiteObservations.metricId, m.id))
      .orderBy(desc(appetiteObservations.observedAt))
      .limit(1);
    out.push({ metric: m, latest: latest ?? null });
  }
  return out;
}

export async function observationHistory(metricId: number, limit = 24) {
  return db
    .select()
    .from(appetiteObservations)
    .where(eq(appetiteObservations.metricId, metricId))
    .orderBy(desc(appetiteObservations.observedAt))
    .limit(limit);
}
