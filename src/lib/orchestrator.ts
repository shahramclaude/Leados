import { db } from "@/db";
import { metricDefs as metricDefsTable, metricValues as metricValuesTable, events as eventsTable } from "@/db/schema";
import { runMetricsIntelligence } from "./metricsIntelligence";
import { ingestObservables, type Observable } from "./beliefFabric";
import type { Domain, LeadosEvent, MetricDef, MetricValue, MetricsIntelligenceReport } from "./types";

// ---------------------------------------------------------------------------
// orchestrator.ts — loads inputs from Postgres, runs the Metrics
// Intelligence pipeline, and feeds the resulting composite domain scores
// into the Belief Fabric as observables.
// ---------------------------------------------------------------------------

export async function loadMetricsIntelligenceInputs(): Promise<{
  metricDefs: MetricDef[];
  metricValues: MetricValue[];
  events: LeadosEvent[];
}> {
  const [defRows, valueRows, eventRows] = await Promise.all([
    db.select().from(metricDefsTable),
    db.select().from(metricValuesTable),
    db.select().from(eventsTable),
  ]);

  const metricDefsOut: MetricDef[] = defRows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    domain: r.domain as Domain,
    unit: r.unit,
    higherIsBetter: r.higherIsBetter,
    target: r.target,
    weight: r.weight,
    description: r.description,
  }));

  const metricValuesOut: MetricValue[] = valueRows.map((r) => ({
    id: r.id,
    metricKey: r.metricKey,
    value: r.value,
    recordedAt: r.recordedAt,
  }));

  const eventsOut: LeadosEvent[] = eventRows.map((r) => ({
    id: r.id,
    type: r.type,
    metricKey: r.metricKey,
    domain: r.domain,
    payload: r.payload,
    occurredAt: r.occurredAt,
  }));

  return { metricDefs: metricDefsOut, metricValues: metricValuesOut, events: eventsOut };
}

export async function getMetricsIntelligenceReport(
  now: Date = new Date(),
): Promise<MetricsIntelligenceReport> {
  const { metricDefs, metricValues, events } = await loadMetricsIntelligenceInputs();
  return runMetricsIntelligence(metricDefs, metricValues, events, now);
}

/**
 * Runs the metrics intelligence pipeline and feeds each domain's composite
 * score into the Belief Fabric as an observable. Confidence is derived from
 * how many metrics backed the domain score (more metrics = more confidence),
 * capped at 0.95.
 */
export async function runOrchestrationPipeline(
  now: Date = new Date(),
): Promise<MetricsIntelligenceReport> {
  const report = await getMetricsIntelligenceReport(now);

  const observables: Observable[] = Object.values(report.compositeScores).map((domainScore) => {
    const metricCount = domainScore.metricsAboveTarget + domainScore.metricsBelowTarget;
    const confidence = Math.min(0.95, 0.4 + metricCount * 0.1);
    return {
      key: `domain_score:${domainScore.domain}`,
      value: domainScore.score,
      confidence,
      source: "metricsIntelligence",
      observedAt: now,
    };
  });

  ingestObservables(observables);

  return report;
}
