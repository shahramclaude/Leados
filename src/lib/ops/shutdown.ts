// Graceful shutdown coordinator: on SIGTERM, stop claiming new jobs, let
// in-flight jobs/streams finish (or checkpoint) within a grace period, close
// the db pool, then exit. `/api/health` reports `draining: true` immediately
// so a load balancer stops routing new traffic the moment shutdown begins.
import { logger } from "@/lib/obs/logger";

let draining = false;
const inFlight = new Set<string>();
const streamClosers: Array<() => void> = [];

export function isDraining(): boolean {
  return draining;
}

export function beginTrackingJob(id: string): void {
  inFlight.add(id);
}
export function finishTrackingJob(id: string): void {
  inFlight.delete(id);
}
export function inFlightCount(): number {
  return inFlight.size;
}

export function registerStreamCloser(close: () => void): () => void {
  streamClosers.push(close);
  return () => {
    const i = streamClosers.indexOf(close);
    if (i >= 0) streamClosers.splice(i, 1);
  };
}

export interface DrainResult {
  ok: boolean;
  waitedMs: number;
  jobsRemaining: number;
  streamsClosed: number;
}

/** Core drain logic, exposed as a pure-ish function so it can be unit
 * tested without sending a real SIGTERM to a real process (see
 * `src/lib/ops/__tests__/shutdown.test.ts` and
 * `docs/RUNBOOKS.md` for the documented limitation: this proves the drain
 * *coordinator* works, not a full container-orchestrator-level drill). */
export async function drain(options: { graceMs: number; pollMs?: number; closeStreams?: boolean } = { graceMs: 10_000 }): Promise<DrainResult> {
  draining = true;
  const pollMs = options.pollMs ?? 50;
  const start = Date.now();
  if (options.closeStreams !== false) {
    for (const close of [...streamClosers]) close();
  }
  while (inFlight.size > 0 && Date.now() - start < options.graceMs) {
    logger.info("shutdown.waiting_for_in_flight", { remaining: inFlight.size });
    await new Promise((r) => setTimeout(r, pollMs));
  }
  const result: DrainResult = {
    ok: inFlight.size === 0,
    waitedMs: Date.now() - start,
    jobsRemaining: inFlight.size,
    streamsClosed: streamClosers.length === 0 ? 0 : streamClosers.length,
  };
  logger.info("shutdown.drain_complete", result as unknown as Record<string, unknown>);
  return result;
}

export function resetForTests(): void {
  draining = false;
  inFlight.clear();
  streamClosers.length = 0;
}
