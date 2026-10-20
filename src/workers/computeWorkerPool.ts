"use client";

import type { MonteCarloParams, NetworkLayoutParams, WorkerResponse } from "./monteCarloWorker";

// ---------------------------------------------------------------------------
// Pool of generic compute workers. Client components should never talk to a
// raw Worker directly — go through this pool so tasks are round-robined,
// progress/cancellation is uniform, and we never spin up more workers than
// the device has cores for.
// ---------------------------------------------------------------------------

type PendingTask = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  onProgress?: (progress: number) => void;
};

let idSeq = 0;
function nextId() {
  idSeq += 1;
  return `task_${Date.now()}_${idSeq}`;
}

class ComputeWorkerPool {
  private workers: Worker[] = [];
  private cursor = 0;
  private pending = new Map<string, { workerIndex: number; task: PendingTask }>();

  private ensureWorkers() {
    if (this.workers.length > 0 || typeof window === "undefined") return;
    const concurrency = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2));
    for (let i = 0; i < concurrency; i++) {
      const worker = new Worker(new URL("./monteCarloWorker.ts", import.meta.url), { type: "module" });
      worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => this.handleMessage(i, event.data));
      this.workers.push(worker);
    }
  }

  private handleMessage(_workerIndex: number, data: WorkerResponse) {
    const entry = this.pending.get(data.id);
    if (!entry) return;

    if (data.type === "progress") {
      entry.task.onProgress?.(data.progress);
      return;
    }
    if (data.type === "result") {
      entry.task.resolve(data.result);
      this.pending.delete(data.id);
      return;
    }
    if (data.type === "error") {
      entry.task.reject(new Error(data.message));
      this.pending.delete(data.id);
      return;
    }
    if (data.type === "cancelled") {
      entry.task.reject(new DOMException("Task cancelled", "AbortError"));
      this.pending.delete(data.id);
    }
  }

  private submit<T>(
    message:
      | { type: "monteCarlo"; params: MonteCarloParams }
      | { type: "networkLayout"; params: NetworkLayoutParams },
    onProgress?: (progress: number) => void,
  ): { promise: Promise<T>; cancel: () => void; id: string } {
    this.ensureWorkers();
    const id = nextId();
    const workerIndex = this.cursor % Math.max(1, this.workers.length);
    this.cursor += 1;

    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        workerIndex,
        task: { resolve: resolve as (v: unknown) => void, reject, onProgress },
      });
    });

    const worker = this.workers[workerIndex];
    worker?.postMessage({ id, ...message });

    const cancel = () => {
      worker?.postMessage({ type: "cancel", targetId: id });
    };

    return { promise, cancel, id };
  }

  runMonteCarlo(params: MonteCarloParams, onProgress?: (progress: number) => void) {
    return this.submit<{ p10: number; p50: number; p90: number; mean: number; trials: number; days: number }>(
      { type: "monteCarlo", params },
      onProgress,
    );
  }

  runNetworkLayout(params: NetworkLayoutParams, onProgress?: (progress: number) => void) {
    return this.submit<{ positions: { id: string; x: number; y: number }[] }>(
      { type: "networkLayout", params },
      onProgress,
    );
  }

  terminateAll() {
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    this.pending.clear();
  }
}

let singleton: ComputeWorkerPool | null = null;

/** Lazily creates (client-only) the shared pool. Safe to call from any client component. */
export function getComputeWorkerPool(): ComputeWorkerPool {
  if (!singleton) singleton = new ComputeWorkerPool();
  return singleton;
}
