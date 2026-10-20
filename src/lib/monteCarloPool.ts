/**
 * monteCarloPool.ts — true multi-core Monte Carlo execution via
 * `node:worker_threads`, pointed at `src/workers/monteCarloWorker.ts`.
 *
 * Sizing: a Node server has no `navigator.hardwareConcurrency`; the
 * documented analog used here is `os.cpus().length` (same intent: size the
 * pool to the number of logical cores available, leave one core free for
 * the event loop / OS by default). A future browser-side Monte Carlo panel
 * (e.g. a "run locally" dev tool) should size its own Worker pool off
 * `navigator.hardwareConcurrency` using the identical chunking contract.
 *
 * Loads the TypeScript worker file at runtime via the `tsx` ESM loader
 * (registered inside a tiny `eval` bootstrap script, so this works whether
 * or not the *parent* process itself was started with `tsx`). See
 * docs/SIMULATION.md "Compute model" for why the HTTP API path does not use
 * this pool.
 */
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import type { WorkerTaskInput } from "@/workers/monteCarloWorker";

export interface PoolRunOptions {
  /** Number of worker threads; defaults to max(1, cpus-1). */
  poolSize?: number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

export interface PoolRunResult {
  kpis: Record<string, number[]>;
  workersUsed: number;
  elapsedMs: number;
  cancelled: boolean;
}

export function defaultPoolSize(): number {
  const cpus = os.cpus()?.length ?? 1;
  return Math.max(1, cpus - 1);
}

function chunk<T>(arr: T[], parts: number): T[][] {
  const out: T[][] = Array.from({ length: parts }, () => []);
  arr.forEach((v, i) => out[i % parts].push(v));
  return out.filter((c) => c.length > 0);
}

function spawnTsWorker(workerFilePath: string, workerData: unknown): Worker {
  const workerUrl = pathToFileURL(workerFilePath).href;
  // Bootstrap: register tsx's ESM loader inside the worker thread itself,
  // then dynamically import the real (TypeScript) worker module. This
  // avoids requiring the parent process to be launched via `tsx`.
  const bootstrap = `
    require('tsx/cjs/api').register();
    import('tsx/esm/api').then(({ register }) => {
      register();
      return import(${JSON.stringify(workerUrl)});
    }).catch((err) => {
      require('node:worker_threads').parentPort.postMessage({ type: 'error', message: String(err && err.stack || err) });
    });
  `;
  return new Worker(bootstrap, { eval: true, workerData });
}

/**
 * Run `totalReplications` Monte Carlo replications of a given task kind
 * across a pool of worker threads, with progress streaming and
 * cooperative cancellation via `AbortSignal`.
 */
export async function runPooled(
  task: Omit<WorkerTaskInput, "replicationIndices">,
  totalReplications: number,
  opts: PoolRunOptions = {},
): Promise<PoolRunResult> {
  const start = Date.now();
  const poolSize = Math.min(opts.poolSize ?? defaultPoolSize(), Math.max(1, totalReplications));
  const indices = Array.from({ length: totalReplications }, (_, i) => i);
  const chunks = chunk(indices, poolSize);

  const workerFile = path.resolve(process.cwd(), "src/workers/monteCarloWorker.ts");

  const kpis: Record<string, number[]> = {};
  const completedByWorker = new Array(chunks.length).fill(0);
  let cancelled = false;

  const workers: Worker[] = [];

  const onAbort = () => {
    cancelled = true;
    for (const w of workers) w.terminate();
  };
  if (opts.signal) {
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener("abort", onAbort, { once: true });
  }

  function reportProgress() {
    if (!opts.onProgress) return;
    const completed = completedByWorker.reduce((a, b) => a + b, 0);
    opts.onProgress(completed, totalReplications);
  }

  const results = await Promise.all(
    chunks.map(
      (replicationIndices, wIdx) =>
        new Promise<void>((resolve, reject) => {
          const worker = spawnTsWorker(workerFile, {
            ...task,
            replicationIndices,
          } satisfies WorkerTaskInput);
          workers.push(worker);

          worker.on("message", (msg: { type: string; completed?: number; total?: number; kpis?: Record<string, number[]>; message?: string }) => {
            if (msg.type === "progress" && typeof msg.completed === "number") {
              completedByWorker[wIdx] = msg.completed;
              reportProgress();
            } else if (msg.type === "result" && msg.kpis) {
              for (const [k, v] of Object.entries(msg.kpis)) {
                if (!kpis[k]) kpis[k] = [];
                kpis[k].push(...v);
              }
              worker.terminate().finally(resolve);
            } else if (msg.type === "error") {
              reject(new Error(msg.message ?? "worker error"));
            }
          });
          worker.on("error", (err) => {
            if (cancelled) resolve();
            else reject(err);
          });
          worker.on("exit", () => {
            if (cancelled) resolve();
          });
        }),
    ),
  ).then(
    () => ({ ok: true as const }),
    (err) => ({ ok: false as const, err }),
  );

  if (!results.ok && !cancelled) throw results.err;

  if (opts.signal) opts.signal.removeEventListener("abort", onAbort);

  return {
    kpis,
    workersUsed: chunks.length,
    elapsedMs: Date.now() - start,
    cancelled,
  };
}
