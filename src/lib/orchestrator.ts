// src/lib/orchestrator.ts
//
// Part 1 deliverable: wires the belief fabric in as Stage 0, ahead of every
// other engine, and threads its output through the rest of the pipeline.
//
// Stage order (per task spec):
//   runBeliefFabric -> updateBeliefNodes -> evaluateRules ->
//   detectCausalChains -> fuseSignals -> talent + finance + execution
//   intelligence -> synthesize -> broadcast

import type {
  IntelligenceSynthesis,
  LeadosEvent,
  LeadosMetrics,
  LeadosPerson,
} from "./types";
import { runBeliefFabric } from "./beliefFabric";
import { queueBeliefSnapshotPersist } from "./temporalBeliefTracker";
import { updateBeliefNodes } from "./knowledgeGraph";
import { evaluateRules, type EvaluatedRule } from "./rulesEngine";
import { detectCausalChains } from "./causalChain";
import { fuseSignals } from "./signalFusion";
import { analyzeTalent } from "./talentEngine";
import { analyzeFinance } from "./financeEngine";
import { analyzeExecution } from "./executionEngine";
import { generateNarrative } from "./narrativeIntel";

export interface OrchestratorResult extends IntelligenceSynthesis {
  rules: EvaluatedRule[];
}

/** Stage "broadcast": in this bootstrap there is no external pub/sub, so
 * broadcasting means logging a structured line other services can tail.
 * Kept side-effect-only and non-throwing so it never blocks the response.
 */
function broadcast(result: OrchestratorResult): void {
  try {
    console.log(
      `[orchestrator] dominantRisk=${result.beliefs.dominantRisk} ` +
        `cascadeRisk=${result.beliefs.cascadeRisk.p.toFixed(3)} ` +
        `rulesFired=${result.rules.length}`,
    );
  } catch {
    // broadcasting must never throw into the caller's critical path
  }
}

export async function runOrchestrator(
  events: LeadosEvent[],
  people: LeadosPerson[],
  metrics: LeadosMetrics,
  now: Date = new Date(),
): Promise<OrchestratorResult> {
  // ---- Stage 0: belief fabric (must run before everything else) ----
  const beliefs = runBeliefFabric(events, people, metrics, now);

  // Fire-and-forget persistence + knowledge-graph refresh. Per the task's
  // non-blocking constraint, neither of these is awaited on the critical
  // path — the caller gets `beliefs` (already computed, in-memory)
  // immediately, and the DB writes happen in the background.
  queueBeliefSnapshotPersist(beliefs);
  void updateBeliefNodes(beliefs).catch((err) => {
    console.error("[orchestrator] updateBeliefNodes failed", err);
  });

  // ---- Stage: evaluateRules (cascadeRisk.p folded into severity) ----
  const rules = evaluateRules(events, now, beliefs.cascadeRisk.p);

  // ---- Stage: detectCausalChains ----
  const causalEdges = detectCausalChains(events, now);

  // ---- Stage: fuseSignals (domain-level recency-weighted fusion; the
  // observable map itself was already pre-computed once, inside
  // runBeliefFabric, and is reused below instead of being recomputed) ----
  const fusedSignals = fuseSignals(events, now);

  // ---- Stage: talent + finance + execution intelligence, each primed with
  // its corresponding belief posterior as a prior multiplier, and all
  // reusing beliefs.observables instead of recomputing from raw events ----
  const talent = analyzeTalent(people, beliefs.posteriors.flightRisk);
  const finance = analyzeFinance(beliefs.observables, beliefs.posteriors.financialRisk);
  const execution = analyzeExecution(beliefs.observables, beliefs.posteriors.executionRisk);

  // ---- Stage: synthesize ----
  const narrative = generateNarrative(beliefs, causalEdges);

  const result: OrchestratorResult = {
    beliefs,
    causalEdges,
    fusedSignals,
    talent,
    finance,
    execution,
    narrative,
    rules,
    generatedAt: now.toISOString(),
  };

  // ---- Stage: broadcast ----
  broadcast(result);

  return result;
}
