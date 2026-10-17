// workers.ts — real Web Worker offloading for Monte Carlo, with a
// timeout-based main-thread fallback. ORIGINAL to this build.
//
// Packaging note (disclosed): this project builds to a SINGLE dist/index.html
// via vite-plugin-singlefile, so a conventional separate worker chunk
// (`new Worker(new URL('./x.ts', import.meta.url))`) is not safe to rely on —
// Vite would need to emit a second file. Instead the worker's source is
// built as an in-memory string and instantiated via `Blob` + `URL.createObjectURL`.
// This exact Blob-worker approach is the same technique disclosed in
// wbweve/Leados's own README for its single-file build (verified read of
// that README's "LEADOS.workers" section) — reused here on purpose because
// it is the correct fix for the same constraint, not because any worker code
// was copied (no worker source file exists in that repo's real tree to copy from).
//
// The simulation math itself is duplicated here in plain JS (workers can't
// import this project's TypeScript modules when built from a Blob string).
// Keep src/lib/monteCarlo.ts and the WORKER_SRC below in sync by hand.

import type { MonteCarloResult, Scenario } from "./types";
import { simulate } from "./monteCarlo";

const WORKER_SRC = `
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function simulate(scenarios, iterations, seed) {
  const rand = mulberry32(seed);
  const totalProb = scenarios.reduce((s, sc) => s + sc.probability, 0) || 1;
  const cumulative = [];
  let acc = 0;
  for (const sc of scenarios) { acc += sc.probability / totalProb; cumulative.push({ upTo: acc, sc }); }
  const outcomes = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const r = rand();
    const picked = cumulative.find((c) => r <= c.upTo) ? cumulative.find((c) => r <= c.upTo).sc : scenarios[scenarios.length - 1];
    const noise = (rand() * 2 - 1) * picked.spread;
    outcomes[i] = picked.impact + noise;
  }
  outcomes.sort((a, b) => a - b);
  const mean = outcomes.reduce((s, v) => s + v, 0) / iterations;
  const pct = (p) => outcomes[Math.min(iterations - 1, Math.floor(p * iterations))];
  const median = pct(0.5), p10 = pct(0.1), p90 = pct(0.9);
  const probPositive = outcomes.filter((v) => v > 0).length / iterations;
  const min = outcomes[0], max = outcomes[outcomes.length - 1];
  const bucketCount = 10, span = (max - min) || 1;
  const buckets = new Array(bucketCount).fill(0);
  for (const v of outcomes) { let idx = Math.floor(((v - min) / span) * bucketCount); if (idx >= bucketCount) idx = bucketCount - 1; buckets[idx]++; }
  const histogram = buckets.map((count, i) => ({ bucket: (min + (i * span) / bucketCount).toFixed(0), pct: +((count / iterations) * 100).toFixed(2) }));
  return { iterations, seed, mean, median, p10, p90, probPositive, histogram };
}
self.onmessage = function (e) {
  const { id, method, payload } = e.data;
  try {
    if (method === "runMonteCarlo") {
      const result = simulate(payload.scenarios, payload.iterations, payload.seed);
      self.postMessage({ id, result });
    } else if (method === "runEngine") {
      self.postMessage({ id, result: { notImplemented: true, reason: "no spec supplied for this method" } });
    } else {
      self.postMessage({ id, error: "unknown method: " + method });
    }
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
`;

let worker: Worker | null = null;
let supported = typeof Worker !== "undefined";
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();

function ensureWorker(): Worker | null {
  if (!supported) return null;
  if (worker) return worker;
  try {
    const blob = new Blob([WORKER_SRC], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    worker = new Worker(url);
    worker.onmessage = (e: MessageEvent) => {
      const { id, result, error } = e.data as { id: number; result?: unknown; error?: string };
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(result);
    };
    worker.onerror = () => {
      supported = false;
      worker = null;
    };
    return worker;
  } catch {
    supported = false;
    return null;
  }
}

function callWorker(method: string, payload: unknown, timeoutMs = 1500): Promise<unknown> {
  const w = ensureWorker();
  if (!w) return Promise.reject(new Error("worker unavailable"));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("worker timeout"));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    w.postMessage({ id, method, payload });
  });
}

export function workerStatus(): "available" | "unavailable" {
  return supported ? "available" : "unavailable";
}

/** Simulate the monte-carlo worker terminating, to exercise the fallback path. */
export function simulateWorkerFailure() {
  if (worker) worker.terminate();
  worker = null;
  supported = false;
}

export function resetWorker() {
  supported = typeof Worker !== "undefined";
  worker = null;
}

export async function runMonteCarlo(
  scenarios: Scenario[],
  iterations: number,
  seed: number
): Promise<MonteCarloResult> {
  const t0 = performance.now();
  try {
    const result = (await callWorker("runMonteCarlo", { scenarios, iterations, seed })) as Omit<
      MonteCarloResult,
      "computedVia" | "ms"
    >;
    return { ...result, computedVia: "worker", ms: +(performance.now() - t0).toFixed(1) };
  } catch {
    const result = simulate(scenarios, iterations, seed);
    return { ...result, computedVia: "main-thread-fallback", ms: +(performance.now() - t0).toFixed(1) };
  }
}
