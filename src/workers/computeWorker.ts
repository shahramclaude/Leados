/**
 * src/workers/computeWorker.ts
 *
 * General-purpose compute worker — the "Part 12" evolution of what used to
 * be a single-purpose Monte Carlo worker. One worker script now handles
 * every CPU-heavy job the UI needs to run off the main thread:
 *   - "monteCarloForecast" — the same algorithm as src/lib/monteCarlo.ts
 *   - "networkLayout"      — force-directed graph layout for the network view
 *
 * Design notes:
 *  - Workers bundled by Next.js/webpack cannot import server-only modules,
 *    and in general a worker script is more robust as a self-contained
 *    bundle entry. The Mersenne-twister-free PRNG (mulberry32) and the
 *    simulation loop below are therefore direct ports of
 *    src/lib/mathUtils.ts / src/lib/monteCarlo.ts rather than shared
 *    imports. If you change either algorithm, mirror the change here too
 *    (this is called out in both source files).
 *  - Every job runs in bounded CHUNK-sized slices with an `await
 *    yieldToEventLoop()` between slices. That accomplishes two things this
 *    part's brief asks for explicitly: (1) progress reporting — we post a
 *    `{ type: "progress" }` message after every chunk — and (2)
 *    cancellation — `cancelled` is a Set checked between chunks, so a
 *    message that arrives mid-run (the main thread calling `.cancel(jobId)`)
 *    takes effect within one chunk instead of only after the whole job
 *    finishes.
 *  - One worker can only run one job at a time; src/lib/computeWorkerPool.ts
 *    manages a small pool of these workers (`navigator.hardwareConcurrency`
 *    capped at 4) and queues/distributes jobs across them, which is what
 *    makes this "a general compute-worker pool" rather than a single
 *    dedicated worker.
 */

type RunMessage = { type: "run"; jobId: string; kind: "monteCarloForecast" | "networkLayout"; payload: unknown };
type CancelMessage = { type: "cancel"; jobId: string };
type InMessage = RunMessage | CancelMessage;

const cancelled = new Set<string>();

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleStandardNormal(rand: () => number): number {
  let u1 = rand();
  const u2 = rand();
  if (u1 < 1e-12) u1 = 1e-12;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

interface MonteCarloPayload {
  currentValue: number;
  meanGrowthRate: number;
  growthVolatility: number;
  periods: number;
  trials: number;
  seed: number;
}

const CHUNK_TRIALS = 500;

async function runMonteCarloForecast(jobId: string, payload: MonteCarloPayload) {
  const { currentValue, meanGrowthRate, growthVolatility, periods, trials, seed } = payload;
  const rand = mulberry32(seed);
  const finalValues = new Array<number>(trials);

  for (let start = 0; start < trials; start += CHUNK_TRIALS) {
    if (cancelled.has(jobId)) {
      cancelled.delete(jobId);
      postMessage({ type: "cancelled", jobId });
      return;
    }
    const end = Math.min(trials, start + CHUNK_TRIALS);
    for (let trial = start; trial < end; trial++) {
      let value = currentValue;
      for (let t = 0; t < periods; t++) {
        const z = sampleStandardNormal(rand);
        const rate = meanGrowthRate + z * growthVolatility;
        value = Math.max(0, value * (1 + rate));
      }
      finalValues[trial] = value;
    }
    postMessage({ type: "progress", jobId, pct: Math.round((end / trials) * 100) });
    await yieldToEventLoop();
  }

  finalValues.sort((a, b) => a - b);
  const mean = finalValues.reduce((s, v) => s + v, 0) / finalValues.length;
  postMessage({ type: "result", jobId, result: { mean: +mean.toFixed(2), finalValues } });
}

interface NetworkLayoutPayload {
  nodes: { id: string; weight: number }[];
  edges: { source: string; target: string }[];
  iterations: number;
  width: number;
  height: number;
}

const CHUNK_TICKS = 10;

async function runNetworkLayout(jobId: string, payload: NetworkLayoutPayload) {
  const { nodes, edges, iterations, width, height } = payload;
  const rand = mulberry32(7);
  const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  for (const node of nodes) {
    positions.set(node.id, { x: rand() * width, y: rand() * height, vx: 0, vy: 0 });
  }

  const k = Math.sqrt((width * height) / Math.max(1, nodes.length));

  for (let tickBlockStart = 0; tickBlockStart < iterations; tickBlockStart += CHUNK_TICKS) {
    if (cancelled.has(jobId)) {
      cancelled.delete(jobId);
      postMessage({ type: "cancelled", jobId });
      return;
    }
    const blockEnd = Math.min(iterations, tickBlockStart + CHUNK_TICKS);
    for (let tick = tickBlockStart; tick < blockEnd; tick++) {
      // Repulsion between every pair (Fruchterman-Reingold style).
      for (const a of nodes) {
        const pa = positions.get(a.id)!;
        pa.vx = 0;
        pa.vy = 0;
        for (const b of nodes) {
          if (a.id === b.id) continue;
          const pb = positions.get(b.id)!;
          const dx = pa.x - pb.x || 0.01;
          const dy = pa.y - pb.y || 0.01;
          const dist2 = dx * dx + dy * dy;
          const force = (k * k) / dist2;
          pa.vx += (dx / Math.sqrt(dist2)) * force;
          pa.vy += (dy / Math.sqrt(dist2)) * force;
        }
      }
      // Attraction along edges.
      for (const edge of edges) {
        const pa = positions.get(edge.source);
        const pb = positions.get(edge.target);
        if (!pa || !pb) continue;
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
        const force = (dist * dist) / k;
        const fx = (dx / dist) * force * 0.02;
        const fy = (dy / dist) * force * 0.02;
        pa.vx -= fx;
        pa.vy -= fy;
        pb.vx += fx;
        pb.vy += fy;
      }
      for (const node of nodes) {
        const p = positions.get(node.id)!;
        p.x = Math.max(10, Math.min(width - 10, p.x + Math.max(-10, Math.min(10, p.vx)) * 0.1));
        p.y = Math.max(10, Math.min(height - 10, p.y + Math.max(-10, Math.min(10, p.vy)) * 0.1));
      }
    }
    postMessage({ type: "progress", jobId, pct: Math.round((blockEnd / iterations) * 100) });
    await yieldToEventLoop();
  }

  const result = nodes.map((n) => ({ id: n.id, ...positions.get(n.id)! }));
  postMessage({ type: "result", jobId, result });
}

addEventListener("message", (event: MessageEvent<InMessage>) => {
  const msg = event.data;
  if (msg.type === "cancel") {
    cancelled.add(msg.jobId);
    return;
  }
  if (msg.kind === "monteCarloForecast") {
    void runMonteCarloForecast(msg.jobId, msg.payload as MonteCarloPayload).catch((error) =>
      postMessage({ type: "error", jobId: msg.jobId, error: String(error) }),
    );
  } else if (msg.kind === "networkLayout") {
    void runNetworkLayout(msg.jobId, msg.payload as NetworkLayoutPayload).catch((error) =>
      postMessage({ type: "error", jobId: msg.jobId, error: String(error) }),
    );
  }
});

export {};
