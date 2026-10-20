/// <reference lib="webworker" />

// ---------------------------------------------------------------------------
// General-purpose compute worker. Runs off the main thread so heavy
// simulation / layout work never blocks input (typing, scrolling, clicking)
// on the dashboard. A single worker file handles multiple task types so the
// pool (computeWorkerPool.ts) can round-robin arbitrary jobs across however
// many workers it spins up.
//
// IMPORTANT: this file is intentionally self-contained (no imports from
// app code) so bundlers that statically trace `new Worker(new URL(...))`
// never see a cycle back to the component that spawns the worker.
// ---------------------------------------------------------------------------

export type MonteCarloParams = {
  trials: number;
  days: number;
  meanDaily: number;
  stdDevDaily: number;
};

export type NetworkLayoutParams = {
  nodeIds: string[];
  edges: { source: string; target: string; weight: number }[];
  iterations: number;
  width: number;
  height: number;
};

export type WorkerTask =
  | { id: string; type: "monteCarlo"; params: MonteCarloParams }
  | { id: string; type: "networkLayout"; params: NetworkLayoutParams }
  | { id: string; type: "cancel"; targetId: string };

export type WorkerResponse =
  | { id: string; type: "progress"; progress: number }
  | { id: string; type: "result"; result: unknown }
  | { id: string; type: "error"; message: string }
  | { id: string; type: "cancelled" };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleNormal(rand: () => number, mean: number, stdDev: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * stdDev;
}

function percentileSorted(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

const cancelled = new Set<string>();

function runMonteCarlo(id: string, params: MonteCarloParams) {
  const { trials, days, meanDaily, stdDevDaily } = params;
  const rand = mulberry32(42 + days);
  const totals = new Float64Array(trials);

  const PROGRESS_EVERY = Math.max(1, Math.floor(trials / 50));

  for (let t = 0; t < trials; t++) {
    if (cancelled.has(id)) {
      cancelled.delete(id);
      postMessage({ id, type: "cancelled" } satisfies WorkerResponse);
      return;
    }
    let total = 0;
    for (let d = 0; d < days; d++) {
      total += Math.max(0, sampleNormal(rand, meanDaily, stdDevDaily));
    }
    totals[t] = total;

    if (t % PROGRESS_EVERY === 0) {
      postMessage({ id, type: "progress", progress: t / trials } satisfies WorkerResponse);
    }
  }

  totals.sort();
  const result = {
    p10: percentileSorted(totals, 10),
    p50: percentileSorted(totals, 50),
    p90: percentileSorted(totals, 90),
    mean: totals.reduce((a, b) => a + b, 0) / totals.length,
    trials,
    days,
  };

  postMessage({ id, type: "progress", progress: 1 } satisfies WorkerResponse);
  postMessage({ id, type: "result", result } satisfies WorkerResponse);
}

function runNetworkLayout(id: string, params: NetworkLayoutParams) {
  const { nodeIds, edges, iterations, width, height } = params;
  const rand = mulberry32(7);
  const n = nodeIds.length;
  const posX = new Float64Array(n);
  const posY = new Float64Array(n);
  const index = new Map(nodeIds.map((nid, i) => [nid, i]));

  for (let i = 0; i < n; i++) {
    posX[i] = rand() * width;
    posY[i] = rand() * height;
  }

  const k = Math.sqrt((width * height) / Math.max(1, n));
  const PROGRESS_EVERY = Math.max(1, Math.floor(iterations / 20));

  for (let iter = 0; iter < iterations; iter++) {
    if (cancelled.has(id)) {
      cancelled.delete(id);
      postMessage({ id, type: "cancelled" } satisfies WorkerResponse);
      return;
    }

    const dispX = new Float64Array(n);
    const dispY = new Float64Array(n);

    // Repulsive force between all pairs (fine for the limited node counts we
    // render — see Network.tsx which caps nodes server-side).
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        let dx = posX[a] - posX[b];
        let dy = posY[a] - posY[b];
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (k * k) / dist;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        dispX[a] += dx;
        dispY[a] += dy;
        dispX[b] -= dx;
        dispY[b] -= dy;
      }
    }

    // Attractive force along edges.
    for (const edge of edges) {
      const a = index.get(edge.source);
      const b = index.get(edge.target);
      if (a === undefined || b === undefined) continue;
      let dx = posX[a] - posX[b];
      let dy = posY[a] - posY[b];
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / k * edge.weight;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      dispX[a] -= dx;
      dispY[a] -= dy;
      dispX[b] += dx;
      dispY[b] += dy;
    }

    const temp = width * 0.1 * (1 - iter / iterations);
    for (let i = 0; i < n; i++) {
      const dist = Math.sqrt(dispX[i] ** 2 + dispY[i] ** 2) || 0.01;
      posX[i] = clamp(posX[i] + (dispX[i] / dist) * Math.min(dist, temp), 0, width);
      posY[i] = clamp(posY[i] + (dispY[i] / dist) * Math.min(dist, temp), 0, height);
    }

    if (iter % PROGRESS_EVERY === 0) {
      postMessage({ id, type: "progress", progress: iter / iterations } satisfies WorkerResponse);
    }
  }

  const positions = nodeIds.map((nid, i) => ({ id: nid, x: posX[i], y: posY[i] }));
  postMessage({ id, type: "progress", progress: 1 } satisfies WorkerResponse);
  postMessage({ id, type: "result", result: { positions } } satisfies WorkerResponse);
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

self.addEventListener("message", (event: MessageEvent<WorkerTask>) => {
  const task = event.data;
  try {
    if (task.type === "cancel") {
      cancelled.add(task.targetId);
      return;
    }
    if (task.type === "monteCarlo") {
      runMonteCarlo(task.id, task.params);
    } else if (task.type === "networkLayout") {
      runNetworkLayout(task.id, task.params);
    }
  } catch (err) {
    postMessage({
      id: "id" in task ? task.id : "unknown",
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
});
