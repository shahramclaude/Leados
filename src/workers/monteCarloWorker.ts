/**
 * monteCarloWorker.ts — Part 06 section C worker-pool executor.
 *
 * Runs a chunk of Monte Carlo replications of either the discrete-event
 * organizational model (`simulation.ts`) or the physics layer
 * (`orgPhysics.ts`) inside a dedicated OS thread (`node:worker_threads`),
 * so that CPU-bound replication work does not block the Node event loop
 * and scales across cores.
 *
 * Message protocol (parent -> worker via `workerData`, worker -> parent via
 * `parentPort.postMessage`):
 *   workerData: WorkerTaskInput (see below)
 *   -> { type: 'progress', completed, total }   (streamed every PROGRESS_EVERY reps)
 *   -> { type: 'result', kpis }                 (terminal message)
 *   -> { type: 'error', message }               (terminal message)
 *
 * Cancellation: the parent simply calls `worker.terminate()`
 * (see monteCarloPool.ts) — Node tears the thread down between
 * replications at the next opportunity since each replication is a short,
 * synchronous unit of work (chunked by design, per the standing order).
 *
 * NOTE ON RUNTIME: this file is TypeScript and is executed via the `tsx`
 * ESM loader (registered dynamically by `monteCarloPool.ts`), NOT bundled
 * into the Next.js server. It is used by the `sim:bench` CLI harness and by
 * any future long-running Node script that needs true multi-core Monte
 * Carlo throughput. The `/api/simulate` HTTP route deliberately uses the
 * simpler in-process chunked engine in `monteCarlo.ts` to avoid worker/ESM
 * complications inside the Next.js server runtime — see docs/SIMULATION.md
 * "Compute model" section for the rationale.
 */
import { parentPort, workerData } from "node:worker_threads";
import { createRng } from "../lib/prng";
import { runDiscreteEventSimulation, type SimConfig } from "../lib/simulation";
import { simulateOrgPhysics, type PhysicsSchedule } from "../lib/orgPhysics";
import { DEFAULT_ORG_ODE_PARAMS, type OrgODEParams } from "../lib/orgODE";
import { summarizeDiscreteEventRun, summarizePhysicsRun } from "../lib/metricsEngine";

export interface WorkerTaskInput {
  kind: "discrete-event" | "physics";
  seedRoot: string;
  replicationIndices: number[];
  antithetic: boolean;
  simConfig?: SimConfig;
  physicsSchedule?: PhysicsSchedule;
  physicsParams?: OrgODEParams;
}

const PROGRESS_EVERY = 25;

function runOne(input: WorkerTaskInput, repIndex: number): Record<string, number> {
  const label = `rep#${repIndex}`;
  const base = createRng(input.seedRoot).substream(label);
  const rng = input.antithetic ? base.antithetic() : base;

  if (input.kind === "discrete-event") {
    if (!input.simConfig) throw new Error("simConfig required for discrete-event replications");
    const result = runDiscreteEventSimulation(input.simConfig, rng);
    return summarizeDiscreteEventRun(result);
  } else {
    if (!input.physicsSchedule) throw new Error("physicsSchedule required for physics replications");
    const params = input.physicsParams ?? DEFAULT_ORG_ODE_PARAMS;
    const trace = simulateOrgPhysics(input.physicsSchedule, params);
    return summarizePhysicsRun(trace);
  }
}

function main() {
  if (!parentPort) throw new Error("monteCarloWorker must be run as a worker_thread");
  const input = workerData as WorkerTaskInput;
  const kpis: Record<string, number[]> = {};
  const total = input.replicationIndices.length;

  try {
    for (let i = 0; i < total; i++) {
      const repIndex = input.replicationIndices[i];
      const sample = runOne(input, repIndex);
      for (const [k, v] of Object.entries(sample)) {
        if (!kpis[k]) kpis[k] = [];
        kpis[k].push(v);
      }
      if ((i + 1) % PROGRESS_EVERY === 0 || i === total - 1) {
        parentPort.postMessage({ type: "progress", completed: i + 1, total });
      }
    }
    parentPort.postMessage({ type: "result", kpis });
  } catch (err) {
    parentPort.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

main();
