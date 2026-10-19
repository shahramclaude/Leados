// src/lib/intelligence.ts
//
// BOOTSTRAP NOTE: no prior intelligence.ts existed in the repository. This
// file is the "current orchestration shell" the task describes as
// inadequate: each engine below runs standalone, with no belief-state
// coupling and no knowledge-graph refresh. It is preserved here, UNUSED by
// orchestrator.ts, purely as the documented "before" baseline the task asks
// us to read and then move past. `orchestrator.ts` (same PR) is the
// replacement entry point — it is NOT built on top of this file.

import type { LeadosEvent, LeadosMetrics, LeadosPerson } from "./types";
import { runScenarios } from "./scenarioEngine";
import { runWargame } from "./wargameEngine";
import { summarizeMetrics } from "./metricsEngine";
import { analyzeTalent } from "./talentEngine";

export interface LegacyIntelligenceSnapshot {
  scenarios: ReturnType<typeof runScenarios>;
  wargame: ReturnType<typeof runWargame>;
  metrics: ReturnType<typeof summarizeMetrics>;
  talent: ReturnType<typeof analyzeTalent>;
}

/**
 * The pre-Part-1 shell: four engines run independently, each ignorant of
 * the others' output and of any belief-network posterior. This is exactly
 * the "isolated silos" problem statement in the task. Kept for reference;
 * not called by orchestrator.ts.
 */
export function runLegacyIntelligence(
  events: LeadosEvent[],
  people: LeadosPerson[],
  metrics: LeadosMetrics,
): LegacyIntelligenceSnapshot {
  void events; // legacy shell never actually threaded events into talent scoring
  return {
    scenarios: runScenarios(),
    wargame: runWargame(),
    metrics: summarizeMetrics(metrics),
    // Notice: no prior multiplier — flightRisk here has no belief coupling,
    // unlike talentEngine's new call site in orchestrator.ts.
    talent: analyzeTalent(people, { p: 0, confidence: 0 }),
  };
}
