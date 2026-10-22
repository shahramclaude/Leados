// src/lib/twin/monteCarloWorker.ts
//
// The "worker" unit of computation for the ensemble: run a batch of
// (seed, antithetic) specs through a single scenario. This function is pure
// and synchronous, which is what lets it be used both:
//  - directly (sim:bench, unit tests, small ensembles), and
//  - behind the cooperative pool in simOrchestration.ts, which just calls
//    this once per chunk and yields to the event loop between chunks.
//
// NOTE on "worker pool": a true OS-thread `worker_threads` pool was
// deliberately NOT wired in here — see AI-SESSION-LOG.md Phase 5 Q4. Next.js
// bundles API routes for a serverless runtime where spawning worker_threads
// against on-disk TS files is unreliable across environments. simOrchestration
// implements the same *interface* (batched execution, progress callbacks,
// cancellation) using cooperative scheduling so it can be swapped for a real
// thread pool later without touching callers.

import type { ScenarioInput, SimulationRunResult } from "./types";
import { runSingleSimulation } from "./orgSimulation";

export interface RunSpec {
  runId: string;
  seed: number;
  antithetic: boolean;
}

export function runBatch(scenario: ScenarioInput, specs: RunSpec[]): SimulationRunResult[] {
  return specs.map((spec) => runSingleSimulation(scenario, spec.seed, spec.antithetic, spec.runId));
}
