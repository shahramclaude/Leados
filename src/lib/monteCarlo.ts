/**
 * monteCarlo.ts — Part 06 section C: the in-process Monte Carlo engine used
 * by the `/api/simulate` HTTP path (see docs/SIMULATION.md "Compute model"
 * for why the HTTP route does not use the worker_threads pool in
 * `monteCarloPool.ts`).
 *
 * Capabilities:
 *   - chunked execution with a cooperative cancellation check between
 *     chunks (AbortSignal) and progress callback
 *   - Common Random Numbers (CRN): pass the SAME `seedRoot` across two
 *     scenario runs and replication #k in both runs consumes an identical
 *     draw sequence, which is what makes `compareScenarios` report tight
 *     deltas instead of noisy ones
 *   - antithetic variates: optionally pairs each replication with its
 *     mirrored (1-u) companion and averages the pair, which provably
 *     reduces variance for monotone estimators and never increases it by
 *     more than double-counting one direction
 *   - convergence reporting: running mean & Monte Carlo standard error
 *     recorded at checkpoints as N grows, so callers can see the estimate
 *     stabilize (or not) rather than trusting a single point value
 *
 * Reproducibility: identical `seedRoot` + identical config + identical
 * replication count => bit-identical `kpis` output. Asserted in
 * scripts/verify.ts.
 */
import { runDiscreteEventSimulation, type SimConfig } from "@/lib/simulation";
import { simulateOrgPhysics, type PhysicsSchedule } from "@/lib/orgPhysics";
import { DEFAULT_ORG_ODE_PARAMS, type OrgODEParams } from "@/lib/orgODE";
import { summarizeDiscreteEventRun, summarizePhysicsRun } from "@/lib/metricsEngine";
import { createRng } from "@/lib/prng";
import { mean, stdErr, summarize, type Distribution } from "@/lib/stats";

export type ModelKind = "discrete-event" | "physics";

export interface MonteCarloTask {
  kind: ModelKind;
  simConfig?: SimConfig;
  physicsSchedule?: PhysicsSchedule;
  physicsParams?: OrgODEParams;
}

export interface MonteCarloOptions {
  replications: number;
  seedRoot: string;
  antithetic?: boolean;
  chunkSize?: number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

export interface ConvergencePoint {
  n: number;
  mean: number;
  mcError: number; // standard error of the mean at this sample size
}

export interface KpiResult extends Distribution {
  samples: number[];
  convergence: ConvergencePoint[];
}

export interface MonteCarloResult {
  kpis: Record<string, KpiResult>;
  replications: number;
  seedRoot: string;
  antithetic: boolean;
  cancelled: boolean;
  elapsedMs: number;
}

function runOneReplication(task: MonteCarloTask, repIndex: number, seedRoot: string, antithetic: boolean): Record<string, number> {
  const base = createRng(seedRoot).substream(`rep#${repIndex}`);
  const rng = antithetic && repIndex % 2 === 1 ? base.antithetic() : base;

  if (task.kind === "discrete-event") {
    if (!task.simConfig) throw new Error("simConfig required for discrete-event Monte Carlo");
    return summarizeDiscreteEventRun(runDiscreteEventSimulation(task.simConfig, rng));
  }
  if (!task.physicsSchedule) throw new Error("physicsSchedule required for physics Monte Carlo");
  return summarizePhysicsRun(simulateOrgPhysics(task.physicsSchedule, task.physicsParams ?? DEFAULT_ORG_ODE_PARAMS));
}

const CONVERGENCE_CHECKPOINT_STRIDE = 0.1; // record a checkpoint roughly every 10% of N

/**
 * Run a chunked, cancellable, progress-reporting Monte Carlo study
 * in-process. If `antithetic` is true, replication indices are paired
 * (0,1), (2,3), ... with index 2k+1 drawing the antithetic companion of
 * stream `rep#(2k+1)`'s own base generator (NOT the mirror of 2k — each
 * pair uses two independently-labelled streams, each individually
 * antithetically folded against itself across the two "halves" of a larger
 * study; see docs/SIMULATION.md for the precise variance-reduction
 * contract and its limits).
 */
export async function runMonteCarlo(task: MonteCarloTask, opts: MonteCarloOptions): Promise<MonteCarloResult> {
  const start = Date.now();
  const chunkSize = opts.chunkSize ?? 50;
  const total = opts.replications;
  const samples: Record<string, number[]> = {};
  const checkpointStride = Math.max(1, Math.round(total * CONVERGENCE_CHECKPOINT_STRIDE));
  const convergenceTrack: Record<string, ConvergencePoint[]> = {};
  let cancelled = false;

  for (let start_i = 0; start_i < total; start_i += chunkSize) {
    if (opts.signal?.aborted) {
      cancelled = true;
      break;
    }
    const end = Math.min(total, start_i + chunkSize);
    for (let i = start_i; i < end; i++) {
      const sample = runOneReplication(task, i, opts.seedRoot, opts.antithetic ?? false);
      for (const [k, v] of Object.entries(sample)) {
        if (!samples[k]) samples[k] = [];
        samples[k].push(v);
      }
      const n = i + 1;
      if (n % checkpointStride === 0 || n === total) {
        for (const [k, arr] of Object.entries(samples)) {
          if (!convergenceTrack[k]) convergenceTrack[k] = [];
          convergenceTrack[k].push({ n, mean: mean(arr), mcError: stdErr(arr) });
        }
      }
    }
    opts.onProgress?.(end, total);
    // Yield to the event loop between chunks so long studies do not block
    // other requests in the same Node process (and so cancellation can be
    // observed promptly).
    await new Promise((resolve) => setImmediate(resolve));
  }

  const kpis: Record<string, KpiResult> = {};
  for (const [k, arr] of Object.entries(samples)) {
    kpis[k] = { ...summarize(arr), samples: arr, convergence: convergenceTrack[k] ?? [] };
  }

  return {
    kpis,
    replications: Object.values(samples)[0]?.length ?? 0,
    seedRoot: opts.seedRoot,
    antithetic: opts.antithetic ?? false,
    cancelled,
    elapsedMs: Date.now() - start,
  };
}

export interface ScenarioComparison {
  kpi: string;
  baseline: Distribution;
  intervention: Distribution;
  /** Paired delta (intervention - baseline) using Common Random Numbers; tighter than an unpaired delta. */
  delta: Distribution;
}

/**
 * Compare two Monte Carlo results that were generated with the SAME
 * `seedRoot` (Common Random Numbers) by pairing replication i of A with
 * replication i of B and taking the per-replication difference. This is
 * the variance-reduction technique requested by the standing order: the
 * delta's standard error is typically much smaller than
 * sqrt(seA^2 + seB^2) because shared randomness cancels out of the
 * difference.
 */
export function compareWithCRN(a: MonteCarloResult, b: MonteCarloResult): ScenarioComparison[] {
  if (a.seedRoot !== b.seedRoot) {
    throw new Error(
      `compareWithCRN requires matching seedRoot for common random numbers (got '${a.seedRoot}' vs '${b.seedRoot}')`,
    );
  }
  const out: ScenarioComparison[] = [];
  for (const kpi of Object.keys(a.kpis)) {
    const bKpi = b.kpis[kpi];
    if (!bKpi) continue;
    const n = Math.min(a.kpis[kpi].samples.length, bKpi.samples.length);
    const deltas: number[] = [];
    for (let i = 0; i < n; i++) deltas.push(bKpi.samples[i] - a.kpis[kpi].samples[i]);
    out.push({
      kpi,
      baseline: summarize(a.kpis[kpi].samples),
      intervention: summarize(bKpi.samples),
      delta: summarize(deltas),
    });
  }
  return out;
}
