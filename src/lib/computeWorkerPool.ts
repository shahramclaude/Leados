"use client";
// src/lib/computeWorkerPool.ts
//
// Client-side manager for src/workers/computeWorker.ts. Spawns a small pool
// of workers (bounded by hardwareConcurrency, capped at 4 — more than that
// rarely helps and would just burn memory on each worker's own JS heap),
// queues jobs when every worker is busy, and exposes cancellation +
// progress per job. This is what "UI interactive during a heavy
// simulation" means in practice: the main thread never runs the simulation
// loop, it only receives `progress` postMessages and can tell a worker to
// stop (`cancel`) at any time.
//
// Falls back to running the job on the main thread (still non-blocking
// thanks to the chunked/yielding loop — see useMonteCarloJob's fallback)
// only when Workers are unavailable (SSR, some test environments).
export type JobKind = "monteCarloForecast" | "networkLayout";

interface JobHandlers {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onProgress?: (pct: number) => void;
}

interface PoolWorker {
  worker: Worker;
  busy: boolean;
}

interface QueuedJob {
  jobId: string;
  kind: JobKind;
  payload: unknown;
}

class ComputeWorkerPool {
  private workers: PoolWorker[] = [];
  private queue: QueuedJob[] = [];
  private jobs = new Map<string, JobHandlers>();
  private jobWorker = new Map<string, PoolWorker>();
  private poolSize: number;

  constructor() {
    this.poolSize = typeof navigator !== "undefined" ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2)) : 2;
  }

  private ensureWorkers() {
    if (this.workers.length > 0 || typeof Worker === "undefined") return;
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(new URL("../workers/computeWorker.ts", import.meta.url));
      const entry: PoolWorker = { worker, busy: false };
      worker.onmessage = (event: MessageEvent) => this.handleMessage(entry, event.data);
      worker.onerror = (event) => {
        console.error("[computeWorkerPool] worker error", event);
        entry.busy = false;
        this.drainQueue();
      };
      this.workers.push(entry);
    }
  }

  private handleMessage(entry: PoolWorker, data: { type: string; jobId: string; pct?: number; result?: unknown; error?: string }) {
    const handlers = this.jobs.get(data.jobId);
    if (data.type === "progress") {
      handlers?.onProgress?.(data.pct ?? 0);
      return;
    }
    if (data.type === "result") {
      handlers?.resolve(data.result);
    } else if (data.type === "error") {
      handlers?.reject(new Error(data.error ?? "compute worker failed"));
    } else if (data.type === "cancelled") {
      handlers?.reject(new DOMException("cancelled", "AbortError"));
    }
    this.jobs.delete(data.jobId);
    this.jobWorker.delete(data.jobId);
    entry.busy = false;
    this.drainQueue();
  }

  private drainQueue() {
    const free = this.workers.find((w) => !w.busy);
    if (!free || this.queue.length === 0) return;
    const job = this.queue.shift()!;
    free.busy = true;
    this.jobWorker.set(job.jobId, free);
    free.worker.postMessage({ type: "run", jobId: job.jobId, kind: job.kind, payload: job.payload });
  }

  isAvailable(): boolean {
    return typeof Worker !== "undefined";
  }

  run<T>(kind: JobKind, payload: unknown, onProgress?: (pct: number) => void): { promise: Promise<T>; cancel: () => void; jobId: string } {
    this.ensureWorkers();
    const jobId = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const promise = new Promise<T>((resolve, reject) => {
      this.jobs.set(jobId, { resolve: resolve as (value: unknown) => void, reject, onProgress });
    });
    this.queue.push({ jobId, kind, payload });
    this.drainQueue();
    return {
      promise,
      jobId,
      cancel: () => {
        const worker = this.jobWorker.get(jobId);
        if (worker) {
          worker.worker.postMessage({ type: "cancel", jobId });
        } else {
          // Still queued, never dispatched — just drop it.
          this.queue = this.queue.filter((j) => j.jobId !== jobId);
          this.jobs.get(jobId)?.reject(new DOMException("cancelled", "AbortError"));
          this.jobs.delete(jobId);
        }
      },
    };
  }

  terminateAll() {
    for (const { worker } of this.workers) worker.terminate();
    this.workers = [];
    this.queue = [];
    this.jobs.clear();
    this.jobWorker.clear();
  }
}

let singleton: ComputeWorkerPool | null = null;

export function getComputeWorkerPool(): ComputeWorkerPool {
  if (!singleton) singleton = new ComputeWorkerPool();
  return singleton;
}
