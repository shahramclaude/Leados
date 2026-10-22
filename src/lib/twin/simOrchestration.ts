// src/lib/twin/simOrchestration.ts
//
// Cooperative "worker pool" orchestration for ensemble runs: chunks the
// requested runs into batches, yields to the event loop between batches
// (so an SSE HTTP response can actually flush progress bytes and so an
// abort signal gets a chance to be observed), and supports cancellation.
//
// HONESTY NOTE: this is cooperative single-process scheduling, not a real
// multi-threaded `worker_threads` pool. See monteCarloWorker.ts header and
// AI-SESSION-LOG.md Phase 5 Q4 for why true OS threads were not wired into
// the Next.js serverless route handlers in this build. The interface
// (batch -> progress -> cancellable) is deliberately worker-pool-shaped so a
// real thread/process pool can be substituted later without changing
// callers.

import type { EnsembleResult, ScenarioInput, SimulationRunResult } from "./types";
import { buildEnsemblePlan, aggregateEnsemble } from "./ensemble";
import { runBatch } from "./monteCarloWorker";

export interface OrchestrationOptions {
  runs?: number;
  seedBase?: number;
  useAntithetic?: boolean;
  useControlVariate?: boolean;
  batchSize?: number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, elapsedMs: number) => void;
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function runEnsembleOrchestrated(
  scenario: ScenarioInput,
  opts: OrchestrationOptions = {},
): Promise<EnsembleResult> {
  const start = Date.now();
  const runs = opts.runs ?? scenario.ensembleRuns;
  const seedBase = opts.seedBase ?? scenario.seedBase;
  const useAntithetic = opts.useAntithetic ?? true;
  const useControlVariate = opts.useControlVariate ?? true;
  const batchSize = opts.batchSize ?? 100;

  const { specs, pairKeys, hash } = buildEnsemblePlan(scenario, runs, seedBase, useAntithetic);
  const allResults = new Map<string, SimulationRunResult>();
  let cancelled = false;

  for (let i = 0; i < specs.length; i += batchSize) {
    if (opts.signal?.aborted) {
      cancelled = true;
      break;
    }
    const batch = specs.slice(i, i + batchSize);
    const batchResults = runBatch(scenario, batch);
    for (const r of batchResults) allResults.set(r.runId, r);
    opts.onProgress?.(Math.min(specs.length, i + batch.length), specs.length, Date.now() - start);
    // Yield so the HTTP stream can flush and the abort signal can propagate.
    await yieldToEventLoop();
  }

  return aggregateEnsemble(scenario, {
    hash,
    pairKeys,
    allResults,
    runs,
    seedBase,
    useAntithetic,
    useControlVariate,
    cancelled,
    durationMs: Date.now() - start,
  });
}
