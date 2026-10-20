// Serial mutation queue, keyed per entity ("notification:<id>",
// "finding:<id>"). Two mutations racing on the same entity (double-click,
// optimistic retry while a prior write is in flight) are chained instead of
// firing concurrently, so the second write always sees the first one's
// settled result — "no lost updates" (requirement C).
//
// This does NOT dedupe/merge mutations (e.g. two different status changes
// queued back to back both run, in order) and does NOT persist across a
// page reload — see docs/FRONTEND.md "Residual risk" for what Part 13's
// durable queue needs to add.
type Task<T> = () => Promise<T>;

class EntityMutationQueue {
  private tails = new Map<string, Promise<unknown>>();

  enqueue<T>(entityKey: string, task: Task<T>): Promise<T> {
    const previous = this.tails.get(entityKey) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    // Store a settled-either-way marker so a failed task doesn't poison the
    // chain for the next caller on the same entity.
    this.tails.set(
      entityKey,
      run.catch(() => undefined),
    );
    return run;
  }

  /** Visible for tests: how many entity queues currently have a pending tail. */
  size(): number {
    return this.tails.size;
  }
}

export const mutationQueue = new EntityMutationQueue();

export function entityKey(type: string, id: string): string {
  return `${type}:${id}`;
}
