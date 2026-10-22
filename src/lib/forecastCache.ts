/**
 * src/lib/forecastCache.ts
 *
 * Reconciliation note (read-before-write): the canonical repo's
 * `src/lib/platform/intelligence/forecastCache.ts` is explicitly NOT a TTL
 * cache — it is invalidated only "by new evidence events, not timers"
 * (Part 04-F standing order). This file does not change that contract. It
 * adds an orthogonal Part 18 concern: serving a durable, previously-computed
 * forecast **immediately** while a fresh one recomputes in the background,
 * specifically so the UI never blocks on a 2-20s simulation. The identity
 * key is still `(tenantId, scenarioKey, inputsHash)` — a new inputs hash
 * (new evidence) always produces a new row rather than overwriting, so
 * correctness invalidation is "by construction": a stale row is only ever
 * served for the *same* inputs hash it was computed for, never masquerading
 * as the answer to different inputs.
 *
 * Durability: results are persisted to `forecast_runs` (Part 18 projection
 * cache) so a process restart does not lose a warm cache — the in-memory
 * `StaleCache` is a read-through layer in front of that table.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { forecastRuns } from "@/db/schema";
import { StaleCache, type StaleResult } from "./staleCache";
import { runForecastEnsemble, type SimInputs, type SimResult } from "./simulation";
import { BoundedQueue, QueueFullError } from "./boundedQueue";

// At most 2 forecasts compute concurrently per process (compute is CPU-bound
// and chunked-cooperative, not free) with up to 8 callers queued before we
// shed load with a 503 instead of letting the queue grow unbounded.
const computeQueue = new BoundedQueue(2, 8);

// 30s freshness window: inside that window we never recompute even if asked
// again (debounces dashboard polling); outside it we serve stale + refresh.
const cache = new StaleCache<SimResult>(30_000);

export { QueueFullError };

function key(inputs: SimInputs): string {
  return `${inputs.tenantId}:${inputs.scenarioKey}:${inputs.inputsHash}`;
}

async function loadPersisted(inputs: SimInputs): Promise<SimResult | undefined> {
  const row = await db
    .select()
    .from(forecastRuns)
    .where(
      and(
        eq(forecastRuns.tenantId, inputs.tenantId),
        eq(forecastRuns.scenarioKey, inputs.scenarioKey),
        eq(forecastRuns.inputsHash, inputs.inputsHash),
      ),
    )
    .orderBy(desc(forecastRuns.computedAt))
    .limit(1);
  const r = row[0];
  if (!r || !r.series || r.p10 == null || r.p50 == null || r.p90 == null) return undefined;
  return {
    final: { n: 0, mean: r.p50, std: 0, p10: r.p10, p50: r.p50, p90: r.p90, min: r.p10, max: r.p90 },
    series: r.series,
    replicationsCompleted: inputs.replications,
    durationMs: r.durationMs ?? 0,
  };
}

async function persist(inputs: SimInputs, result: SimResult) {
  await db
    .insert(forecastRuns)
    .values({
      tenantId: inputs.tenantId,
      scenarioKey: inputs.scenarioKey,
      inputsHash: inputs.inputsHash,
      status: "ready",
      p10: result.final.p10,
      p50: result.final.p50,
      p90: result.final.p90,
      series: result.series,
      durationMs: result.durationMs,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [forecastRuns.tenantId, forecastRuns.scenarioKey, forecastRuns.inputsHash],
      set: {
        p10: result.final.p10,
        p50: result.final.p50,
        p90: result.final.p90,
        series: result.series,
        durationMs: result.durationMs,
        computedAt: new Date(),
        status: "ready",
      },
    });
}

export interface ForecastResponse extends StaleResult<SimResult> {
  queueDepth: number;
}

/**
 * Entry point used by `/api/forecast`. Throws `QueueFullError` (mapped to a
 * 503 + Retry-After by the route) when compute is saturated AND there is no
 * cached-even-stale value to fall back to.
 */
export async function getForecast(inputs: SimInputs): Promise<ForecastResponse> {
  const k = key(inputs);

  try {
    const result = await cache.getOrCompute(k, async () => {
      const persisted = await loadPersisted(inputs);
      if (persisted) return persisted;
      return computeQueue.run(async () => {
        const fresh = await runForecastEnsemble(inputs);
        await persist(inputs, fresh);
        return fresh;
      });
    });
    return { ...result, queueDepth: computeQueue.stats.queued };
  } catch (err) {
    if (err instanceof QueueFullError) {
      // Last resort: if there is ANY persisted row (even for a slightly
      // different historical run we already evicted from memory), serve it
      // stale rather than fail the request outright.
      const persisted = await loadPersisted(inputs);
      if (persisted) {
        return { value: persisted, stale: true, staleForMs: Infinity, computeMs: persisted.durationMs, queueDepth: computeQueue.stats.queued };
      }
    }
    throw err;
  }
}

export function forecastQueueStats() {
  return computeQueue.stats;
}
