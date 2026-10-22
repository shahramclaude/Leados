/**
 * src/lib/monteCarloPool.ts — spawns a pool of `monteCarloWorker.ts`
 * instances (one per CPU core by default) to run a large replication count
 * with true multi-core parallelism. Used only by `scripts/sim-bench.ts`
 * (the Part 06-style throughput benchmark) — never by the Next.js app.
 */
import { Worker } from "node:worker_threads";
import { cpus } from "node:os";
import path from "node:path";

export interface PoolRunInput {
  seed: number;
  replications: number;
  headcount: number;
  avgRisk: number;
  horizonWeeks: number;
  workers?: number;
}

export interface PoolRunResult {
  finals: number[];
  wallMs: number;
  workerCount: number;
}

function chunk<T>(arr: T[], parts: number): T[][] {
  const out: T[][] = Array.from({ length: parts }, () => []);
  arr.forEach((v, i) => out[i % parts].push(v));
  return out;
}

export async function runPooled(input: PoolRunInput): Promise<PoolRunResult> {
  const workerCount = Math.max(1, Math.min(input.workers ?? cpus().length, input.replications));
  const indices = Array.from({ length: input.replications }, (_, i) => i);
  const groups = chunk(indices, workerCount);
  const workerPath = path.resolve(__dirname, "../workers/monteCarloWorker.ts");

  const start = Date.now();
  const results = await Promise.all(
    groups.map(
      (replicationIndices) =>
        new Promise<number[]>((resolve, reject) => {
          const worker = new Worker(workerPath, {
            execArgv: ["--require", "tsx/cjs"],
            workerData: {
              seed: input.seed,
              replicationIndices,
              headcount: input.headcount,
              avgRisk: input.avgRisk,
              horizonWeeks: input.horizonWeeks,
            },
          });
          worker.on("message", (msg) => {
            if (msg.type === "result") {
              resolve(msg.finals);
              worker.terminate();
            } else if (msg.type === "error") {
              reject(new Error(msg.message));
              worker.terminate();
            }
          });
          worker.on("error", reject);
        }),
    ),
  );

  return {
    finals: results.flat(),
    wallMs: Date.now() - start,
    workerCount,
  };
}
