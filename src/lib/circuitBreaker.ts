// LEADOS — Part 35 resilience lab: circuit breakers + degraded modes.
//
// Reads/depends on: src/lib/faultInjection.ts (simulated dependency calls),
// src/lib/slo.ts (trip thresholds), src/db/schema.ts (circuitBreakerStates,
// persisted so the Degradation Status page reflects real breaker state).
//
// State machine: closed -> open (after N consecutive failures or error-rate
// breach) -> half_open (after cooldown, allows exactly ONE trial call so a
// recovering dependency is not hit by a thundering herd of retries) ->
// closed (trial succeeded) or open again (trial failed).

import { db } from "@/db";
import { circuitBreakerStates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SLO } from "./slo";

export type BreakerState = "closed" | "open" | "half_open";

type BreakerRecord = {
  state: BreakerState;
  failureCount: number;
  lastFailureAt: number | null;
  lastStateChangeAt: number;
  halfOpenTrialInFlight: boolean;
  cooldownMs: number;
};

type Registry = Record<string, BreakerRecord>;

const globalForBreakers = globalThis as typeof globalThis & {
  __leadosBreakerRegistry?: Registry;
};

const registry: Registry = globalForBreakers.__leadosBreakerRegistry ?? {};
globalForBreakers.__leadosBreakerRegistry = registry;

function getRecord(key: string, cooldownMs: number): BreakerRecord {
  if (!registry[key]) {
    registry[key] = {
      state: "closed",
      failureCount: 0,
      lastFailureAt: null,
      lastStateChangeAt: Date.now(),
      halfOpenTrialInFlight: false,
      cooldownMs,
    };
  }
  return registry[key];
}

export function resetBreaker(key: string) {
  delete registry[key];
}

export function resetAllBreakers() {
  for (const key of Object.keys(registry)) delete registry[key];
}

export type BreakerOutcome<T> =
  | { status: "closed-success"; value: T }
  | { status: "half-open-trial-success"; value: T }
  | { status: "short-circuited"; reason: string }
  | { status: "failed-call"; error: unknown };

/**
 * Wrap a dependency call with circuit-breaker semantics.
 * `isHalfOpenTrialAllowed` logic guarantees only one concurrent trial call is
 * made while half-open — the anti-thundering-herd behaviour tested in
 * exp-provider-error-rate.
 */
export async function withBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  opts: { consecutiveFailureThreshold?: number; cooldownMs?: number } = {},
): Promise<BreakerOutcome<T>> {
  const threshold = opts.consecutiveFailureThreshold ?? SLO.providerBreakerConsecutiveFailures;
  const cooldownMs = opts.cooldownMs ?? 2000;
  const record = getRecord(key, cooldownMs);

  if (record.state === "open") {
    const elapsed = Date.now() - record.lastStateChangeAt;
    if (elapsed < record.cooldownMs) {
      return { status: "short-circuited", reason: `open (cooldown ${record.cooldownMs - elapsed}ms remaining)` };
    }
    // Cooldown elapsed: move to half-open, but only let ONE caller through.
    record.state = "half_open";
    record.lastStateChangeAt = Date.now();
  }

  if (record.state === "half_open") {
    if (record.halfOpenTrialInFlight) {
      return { status: "short-circuited", reason: "half-open: a trial call is already in flight" };
    }
    record.halfOpenTrialInFlight = true;
    try {
      const value = await fn();
      record.state = "closed";
      record.failureCount = 0;
      record.lastStateChangeAt = Date.now();
      return { status: "half-open-trial-success", value };
    } catch (error) {
      record.state = "open";
      record.failureCount += 1;
      record.lastFailureAt = Date.now();
      record.lastStateChangeAt = Date.now();
      return { status: "failed-call", error };
    } finally {
      record.halfOpenTrialInFlight = false;
    }
  }

  // closed
  try {
    const value = await fn();
    record.failureCount = 0;
    return { status: "closed-success", value };
  } catch (error) {
    record.failureCount += 1;
    record.lastFailureAt = Date.now();
    if (record.failureCount >= threshold) {
      record.state = "open";
      record.lastStateChangeAt = Date.now();
    }
    return { status: "failed-call", error };
  }
}

export function breakerSnapshot(key: string) {
  const record = registry[key];
  if (!record) return { state: "closed" as BreakerState, failureCount: 0 };
  return { state: record.state, failureCount: record.failureCount };
}

export async function persistBreakerState(
  dependencyKey: string,
  label: string,
  degradedModeDescription: string,
  userVisibleMessage: string,
) {
  const snap = breakerSnapshot(dependencyKey);
  const existing = await db
    .select()
    .from(circuitBreakerStates)
    .where(eq(circuitBreakerStates.dependencyKey, dependencyKey));

  if (existing.length === 0) {
    await db.insert(circuitBreakerStates).values({
      dependencyKey,
      label,
      state: snap.state,
      failureCount: snap.failureCount,
      lastFailureAt: snap.failureCount > 0 ? new Date() : null,
      degradedModeDescription,
      userVisibleMessage,
    });
  } else {
    await db
      .update(circuitBreakerStates)
      .set({
        state: snap.state,
        failureCount: snap.failureCount,
        lastStateChangeAt: new Date(),
        degradedModeDescription,
        userVisibleMessage,
      })
      .where(eq(circuitBreakerStates.dependencyKey, dependencyKey));
  }
}
