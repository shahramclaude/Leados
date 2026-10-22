/**
 * src/workers/monteCarloWorker.ts — offline worker-pool executor.
 *
 * Runs a chunk of forecast replications inside a dedicated OS thread
 * (`node:worker_threads`) so CPU-bound replication work can scale across
 * cores. This file is executed via the `tsx` loader by
 * `src/lib/monteCarloPool.ts` from the `npm run sim:bench` CLI ONLY — it is
 * never imported by any Next.js route or component, so it never enters the
 * server bundle (see src/lib/simulation.ts for the in-process engine that
 * the HTTP route actually uses, and the rationale for the split).
 *
 * Message protocol:
 *   workerData: WorkerTaskInput
 *   -> { type: 'progress', completed, total }
 *   -> { type: 'result', finals: number[] }
 *   -> { type: 'error', message: string }
 */
import { parentPort, workerData } from "node:worker_threads";
import { mulberry32, randNormal, clamp } from "../lib/mathUtils";

export interface WorkerTaskInput {
  seed: number;
  replicationIndices: number[];
  headcount: number;
  avgRisk: number;
  horizonWeeks: number;
}

function runOne(seed: number, headcount: number, avgRisk: number, horizonWeeks: number): number {
  const rand = mulberry32(seed);
  let capacity = headcount;
  const weeklyAttritionBase = 0.004 + avgRisk * 0.01;
  for (let week = 0; week < horizonWeeks; week++) {
    const shock = randNormal(rand, 0, 0.6);
    const hazard = clamp(weeklyAttritionBase * (1 + shock), 0, 0.08);
    const leavers = capacity * hazard;
    const hires = capacity * 0.006 * (1 + randNormal(rand, 0, 0.3));
    capacity = Math.max(0, capacity - leavers + hires);
  }
  return capacity;
}

function main() {
  const input = workerData as WorkerTaskInput;
  const finals: number[] = [];
  const PROGRESS_EVERY = 25;
  try {
    for (let i = 0; i < input.replicationIndices.length; i++) {
      const repIndex = input.replicationIndices[i];
      const seed = (input.seed ^ (repIndex * 2654435761)) >>> 0;
      finals.push(runOne(seed, input.headcount, input.avgRisk, input.horizonWeeks));
      if ((i + 1) % PROGRESS_EVERY === 0) {
        parentPort?.postMessage({ type: "progress", completed: i + 1, total: input.replicationIndices.length });
      }
    }
    parentPort?.postMessage({ type: "result", finals });
  } catch (err) {
    parentPort?.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

main();
