/**
 * src/lib/boundedQueue.ts — Part 18 backpressure primitive.
 *
 * Caps the number of concurrently-running heavy compute jobs (Monte Carlo
 * forecasts) to `maxConcurrent`, and caps the number of callers waiting for
 * a slot to `maxQueued`. When both are full, `run()` throws `QueueFullError`
 * immediately instead of accepting unbounded work ("queueing with
 * backpressure over collapse" — Phase 2). The API route maps that to a 503
 * with `Retry-After` rather than hanging the request or OOMing the process.
 */

export class QueueFullError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("compute queue is full");
    this.name = "QueueFullError";
  }
}

export class BoundedQueue {
  private running = 0;
  private queued = 0;

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
  ) {}

  get stats() {
    return { running: this.running, queued: this.queued, maxConcurrent: this.maxConcurrent, maxQueued: this.maxQueued };
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrent) {
      if (this.queued >= this.maxQueued) {
        throw new QueueFullError(2);
      }
      this.queued++;
      try {
        await this.waitForSlot();
      } finally {
        this.queued--;
      }
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
    }
  }

  private waitForSlot(): Promise<void> {
    return new Promise((resolve) => {
      const tick = () => {
        if (this.running < this.maxConcurrent) {
          resolve();
        } else {
          setTimeout(tick, 10);
        }
      };
      tick();
    });
  }
}
