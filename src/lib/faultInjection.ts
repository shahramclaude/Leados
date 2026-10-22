// LEADOS — Part 35 resilience lab: fault injection control plane.
//
// This repository snapshot does not contain Part 18's real queue or any real
// third-party provider client, so the chaos harness injects faults into an
// in-process simulated dependency layer that stands in for: the Postgres
// connection pool (db), Part 18's job queue (queue), an outbound third-party
// API such as email/payment (provider), and the network link to it (network).
// Every injection here is a REAL code path being exercised (real delays, real
// thrown errors, real bounded arrays) — only the "remote system" on the other
// end is simulated. This is called out as a limitation in RESILIENCE.md
// Phase 5 ("what we deliberately did not do").

export type DependencyKey = "db" | "queue" | "provider" | "network";

type Knobs = {
  latencyMs: number;
  errorRate: number; // 0..1
  outage: boolean;
  killedUntil: number | null; // epoch ms; process_kill injection
  clockSkewMs: number;
};

const defaultKnobs = (): Knobs => ({
  latencyMs: 0,
  errorRate: 0,
  outage: false,
  killedUntil: null,
  clockSkewMs: 0,
});

type ControlPlane = {
  db: Knobs;
  queue: Knobs;
  provider: Knobs;
  network: Knobs;
  queueDepth: number;
  queueBuffer: unknown[];
};

const globalForFaults = globalThis as typeof globalThis & {
  __leadosResilienceControlPlane?: ControlPlane;
};

function freshControlPlane(): ControlPlane {
  return {
    db: defaultKnobs(),
    queue: defaultKnobs(),
    provider: defaultKnobs(),
    network: defaultKnobs(),
    queueDepth: 0,
    queueBuffer: [],
  };
}

export const controlPlane: ControlPlane =
  globalForFaults.__leadosResilienceControlPlane ?? freshControlPlane();
globalForFaults.__leadosResilienceControlPlane = controlPlane;

export function resetAllFaults() {
  controlPlane.db = defaultKnobs();
  controlPlane.queue = defaultKnobs();
  controlPlane.provider = defaultKnobs();
  controlPlane.network = defaultKnobs();
  controlPlane.queueDepth = 0;
  controlPlane.queueBuffer = [];
}

export function setFault(dep: DependencyKey, patch: Partial<Knobs>) {
  controlPlane[dep] = { ...controlPlane[dep], ...patch };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SimulatedTimeoutError extends Error {
  constructor(dep: string) {
    super(`${dep}: call exceeded timeout`);
    this.name = "SimulatedTimeoutError";
  }
}
export class SimulatedDependencyError extends Error {
  constructor(dep: string, reason: string) {
    super(`${dep}: ${reason}`);
    this.name = "SimulatedDependencyError";
  }
}
export class QueueFullError extends Error {
  constructor() {
    super("queue: backpressure engaged, buffer full");
    this.name = "QueueFullError";
  }
}

/** Generic timed call against a faulted dependency. Throws on injected errors/outage/kill. */
export async function callDependency<T>(
  dep: DependencyKey,
  work: () => T,
  opts: { timeoutMs?: number } = {},
): Promise<{ value: T; latencyMs: number }> {
  const knobs = controlPlane[dep];
  const start = Date.now();

  if (knobs.killedUntil && Date.now() < knobs.killedUntil) {
    throw new SimulatedDependencyError(dep, "process killed / unavailable");
  }
  if (knobs.outage) {
    throw new SimulatedDependencyError(dep, "dependency outage");
  }
  if (knobs.errorRate > 0 && Math.random() < knobs.errorRate) {
    // still pay the latency cost, errors are not free
    if (knobs.latencyMs > 0) await sleep(knobs.latencyMs);
    throw new SimulatedDependencyError(dep, "injected error_rate fault");
  }

  const effectiveTimeout = opts.timeoutMs;
  if (knobs.latencyMs > 0) {
    if (effectiveTimeout && knobs.latencyMs > effectiveTimeout) {
      await sleep(effectiveTimeout);
      throw new SimulatedTimeoutError(dep);
    }
    await sleep(knobs.latencyMs);
  }

  const value = work();
  return { value, latencyMs: Date.now() - start };
}

/** Bounded queue simulating Part 18's broker with backpressure instead of unbounded growth. */
export function enqueueSimulated(job: unknown, maxDepth: number): "accepted" | "degraded-local-buffer" {
  const knobs = controlPlane.queue;
  if (knobs.killedUntil && Date.now() < knobs.killedUntil) {
    throw new SimulatedDependencyError("queue", "broker process killed");
  }
  if (knobs.outage) {
    // Degrade: hold job in a small local outbox instead of crashing the caller.
    if (controlPlane.queueBuffer.length >= maxDepth) {
      throw new QueueFullError();
    }
    controlPlane.queueBuffer.push(job);
    return "degraded-local-buffer";
  }
  if (controlPlane.queueDepth >= maxDepth) {
    throw new QueueFullError();
  }
  controlPlane.queueDepth += 1;
  return "accepted";
}

export function drainSimulatedQueue(n: number) {
  controlPlane.queueDepth = Math.max(0, controlPlane.queueDepth - n);
}

export function currentClockSkewMs(dep: DependencyKey = "db"): number {
  return controlPlane[dep].clockSkewMs;
}
