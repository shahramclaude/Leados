/**
 * workerPool.ts — generic task-queue worker pool for CPU-bound work
 * (Monte Carlo today; intended for reuse by the digital-twin/finance
 * modules later, per the standing architecture note).
 *
 * Two execution strategies behind one API:
 *   - "threads": real Node worker_threads, one per pool slot, running
 *     src/lib/intelligence/mcCore.cjs. Used whenever available (Node runtime,
 *     e.g. the /api/simulate route).
 *   - "inline": synchronous, same-thread execution of the identical
 *     mcCore.cjs `runChunk` function, split into cooperative batches so
 *     progress/cancellation still work. Used in scripts (eval harness,
 *     property tests) and as an automatic fallback if worker_threads can't
 *     be used in the current runtime.
 * Both strategies call the SAME function from mcCore.cjs, so results for a
 * given seed are identical regardless of strategy — this is load-bearing
 * for the "identical seeds -> identical results" property test.
 *
 * `require("worker_threads")` and `new Worker(...)` are obtained through an
 * indirect `eval("require")` call so bundlers (webpack/Turbopack, used by
 * `next build`) do not try to statically resolve/inline worker_threads; this
 * keeps the production build safe even though workers are an optional,
 * environment-dependent optimization.
 */

import path from "node:path";

export interface McVariableSpec {
  id: string;
  mean: number;
  sd: number;
  weight: number;
}

export interface McScenarioSpec {
  label?: string;
  variables: McVariableSpec[];
  budget: number;
}

export interface ChunkResult {
  n: number;
  sumOverrun: number;
  sumOverrunSq: number;
  sumExceed: number;
  sumExceedSq: number;
  muT: number;
  sigmaT: number;
  cancelled: boolean;
}

type RunChunkFn = (
  seed: string,
  pairCount: number,
  scenario: McScenarioSpec,
  options?: { onProgress?: (done: number, total: number) => void; isCancelled?: () => boolean },
) => ChunkResult;

let cachedCore: { runChunk: RunChunkFn } | null = null;
function loadCoreInline(): { runChunk: RunChunkFn } {
  if (cachedCore) return cachedCore;
  const req: NodeRequire = eval("require");
  const corePath = path.join(process.cwd(), "src/lib/intelligence/mcCore.cjs");
  cachedCore = req(corePath) as { runChunk: RunChunkFn };
  return cachedCore;
}

function tryLoadWorkerThreads(): typeof import("worker_threads") | null {
  try {
    const req: NodeRequire = eval("require");
    return req("worker_threads");
  } catch {
    return null;
  }
}

export interface PoolProgress {
  completedPairs: number;
  totalPairs: number;
}

export interface RunPoolOptions {
  seed: string;
  scenario: McScenarioSpec;
  totalPairs: number;
  chunkSize?: number;
  poolSize?: number;
  onProgress?: (p: PoolProgress) => void;
  isCancelled?: () => boolean;
  /** Force a strategy — mainly for tests that must assert both paths agree. */
  strategy?: "threads" | "inline" | "auto";
}

export interface RunPoolResult {
  chunks: ChunkResult[];
  strategyUsed: "threads" | "inline";
  cancelled: boolean;
}

/**
 * Splits `totalPairs` into deterministic, fixed-size chunks and executes
 * them either across real worker threads or inline, aggregating results.
 * Chunk seeds are derived as `${seed}:chunk:${index}` so the partition is
 * reproducible independent of scheduling order.
 */
export async function runWorkerPool(opts: RunPoolOptions): Promise<RunPoolResult> {
  const chunkSize = opts.chunkSize ?? 2000;
  const poolSize = opts.poolSize ?? 4;
  const numChunks = Math.max(1, Math.ceil(opts.totalPairs / chunkSize));
  const chunkPlan = Array.from({ length: numChunks }, (_, i) => {
    const start = i * chunkSize;
    const size = Math.min(chunkSize, opts.totalPairs - start);
    return { index: i, pairCount: size, seed: `${opts.seed}:chunk:${i}` };
  }).filter((c) => c.pairCount > 0);

  const wantThreads = opts.strategy === "threads" || opts.strategy === undefined || opts.strategy === "auto";
  const workerThreads = wantThreads && opts.strategy !== "inline" ? tryLoadWorkerThreads() : null;

  let completedPairsTotal = 0;
  const totalPairs = opts.totalPairs;
  const reportProgress = () => opts.onProgress?.({ completedPairs: completedPairsTotal, totalPairs });

  if (workerThreads && opts.strategy !== "inline") {
    const results = await runWithThreads(workerThreads, chunkPlan, opts.scenario, poolSize, (delta) => {
      completedPairsTotal += delta;
      reportProgress();
    }, opts.isCancelled);
    return { chunks: results, strategyUsed: "threads", cancelled: results.some((r) => r.cancelled) };
  }

  // Inline fallback: cooperative batching so progress/cancellation still work.
  const core = loadCoreInline();
  const results: ChunkResult[] = [];
  for (const chunk of chunkPlan) {
    if (opts.isCancelled?.()) break;
    let lastDone = 0;
    const result = core.runChunk(chunk.seed, chunk.pairCount, opts.scenario, {
      isCancelled: opts.isCancelled,
      onProgress: (done) => {
        completedPairsTotal += done - lastDone;
        lastDone = done;
        reportProgress();
      },
    });
    completedPairsTotal += chunk.pairCount - lastDone;
    reportProgress();
    results.push(result);
    if (result.cancelled) break;
  }
  return { chunks: results, strategyUsed: "inline", cancelled: results.some((r) => r.cancelled) };
}

interface WorkerThreadsModule {
  Worker: new (filename: string) => WorkerInstance;
}
interface WorkerInstance {
  postMessage: (msg: unknown) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  terminate: () => Promise<number>;
}

function runWithThreads(
  wt: unknown,
  chunkPlan: { index: number; pairCount: number; seed: string }[],
  scenario: McScenarioSpec,
  poolSize: number,
  onPairsDelta: (delta: number) => void,
  isCancelled?: () => boolean,
): Promise<ChunkResult[]> {
  const { Worker } = wt as WorkerThreadsModule;
  const corePath = path.join(process.cwd(), "src/lib/intelligence/mcCore.cjs");

  return new Promise((resolve) => {
    const results: ChunkResult[] = [];
    const workers: WorkerInstance[] = [];
    let nextChunkIdx = 0;
    let active = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      for (const w of workers) void w.terminate();
      resolve(results);
    };

    const size = Math.max(1, Math.min(poolSize, chunkPlan.length));
    const progressTracked = new Map<number, number>();

    function dispatchNext(worker: WorkerInstance) {
      if (isCancelled?.()) {
        finish();
        return;
      }
      if (nextChunkIdx >= chunkPlan.length) {
        active -= 1;
        if (active <= 0) finish();
        return;
      }
      const chunk = chunkPlan[nextChunkIdx++];
      const taskId = chunk.index;
      progressTracked.set(taskId, 0);
      worker.postMessage({ type: "run", taskId, seed: chunk.seed, pairCount: chunk.pairCount, scenario });
    }

    for (let i = 0; i < size; i++) {
      const worker = new Worker(corePath);
      workers.push(worker);
      active += 1;
      worker.on("message", (...args: unknown[]) => {
        const msg = args[0] as { type: string; taskId: number; done?: number; total?: number; result?: ChunkResult };
        if (msg.type === "progress") {
          const prev = progressTracked.get(msg.taskId) ?? 0;
          const done = msg.done ?? 0;
          progressTracked.set(msg.taskId, done);
          onPairsDelta(done - prev);
        } else if (msg.type === "done") {
          const prev = progressTracked.get(msg.taskId) ?? 0;
          const result = msg.result as ChunkResult;
          onPairsDelta(result.n - prev);
          results.push(result);
          if (isCancelled?.()) {
            worker.postMessage({ type: "cancel" });
          }
          dispatchNext(worker);
        } else if (msg.type === "error") {
          dispatchNext(worker);
        }
      });
      worker.on("error", () => dispatchNext(worker));
      dispatchNext(worker);
    }

    if (chunkPlan.length === 0) finish();
  });
}
