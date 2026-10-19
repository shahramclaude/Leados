// src/lib/intelligence/forecastCache.ts
//
// Evidence-keyed forecast cache. The cache key is a hash of the *inputs*
// that determine a forecast (drivers, scenario, trials, seed) — NOT the
// current time. This guarantees the cache invalidates exactly when new
// evidence changes the inputs, and never serves a stale forecast just
// because a clock ticked, nor recomputes needlessly when nothing changed.
import { createHash } from "crypto";
import type { MonteCarloInput, MonteCarloResult } from "./monteCarlo";

export function hashEvidence(input: MonteCarloInput): string {
  const canonical = JSON.stringify({
    subject: input.subject,
    drivers: [...input.drivers].sort((a, b) => a.name.localeCompare(b.name)),
    trials: input.trials ?? null,
    seed: input.seed ?? null,
    scenario: input.scenario ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

interface CacheEntry {
  evidenceHash: string;
  result: MonteCarloResult;
  storedAt: string;
}

export class ForecastCache {
  private entries = new Map<string, CacheEntry>();

  private key(subject: string, scenario: string): string {
    return `${subject}::${scenario}`;
  }

  get(input: MonteCarloInput): MonteCarloResult | undefined {
    const key = this.key(input.subject, input.scenario?.name ?? "baseline");
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    const currentHash = hashEvidence(input);
    if (entry.evidenceHash !== currentHash) {
      // Evidence changed since this was cached — invalidate, do not serve.
      this.entries.delete(key);
      return undefined;
    }
    return entry.result;
  }

  set(input: MonteCarloInput, result: MonteCarloResult): void {
    const key = this.key(input.subject, input.scenario?.name ?? "baseline");
    this.entries.set(key, {
      evidenceHash: hashEvidence(input),
      result,
      storedAt: new Date().toISOString(),
    });
  }

  /** Explicit invalidation hook called when new evidence arrives for a
   * subject (e.g. a metric updated), regardless of whether the hash would
   * have caught it — belt and braces for callers that mutate in place. */
  invalidateSubject(subject: string): void {
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(`${subject}::`)) this.entries.delete(key);
    }
  }

  size(): number {
    return this.entries.size;
  }
}

export const globalForecastCache = new ForecastCache();
