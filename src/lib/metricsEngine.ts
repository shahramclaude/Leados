// src/lib/metricsEngine.ts
//
// BOOTSTRAP NOTE: see scenarioEngine.ts — legacy standalone stub, not wired
// into the Part-1 belief-coupled orchestrator.

import type { LeadosMetrics } from "./types";

export function summarizeMetrics(metrics: LeadosMetrics): Record<string, number> {
  return {
    avgCycleTimeDays: metrics.decisionHealthIndex.avgCycleTimeDays,
    isolatedNodes: metrics.orgNetwork.isolatedCount,
  };
}
