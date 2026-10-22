// src/lib/twin/forecastCache.ts
//
// Result cache keyed by (scenarioHash, seed, modelVersion), per Phase 3.
// Two tiers:
//   1. An in-memory Map (fast path, survives within one server process).
//   2. A Postgres-backed table (`sim_runs`) so the cache survives restarts
//      and gives an audit trail of what was actually run, when, with which
//      seed/model version (supports the reproducibility chip in the UI).

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { simRuns } from "@/db/schema";
import type { EnsembleResult, ScenarioInput } from "./types";
import { MODEL_VERSION } from "./modelVersion";

function cacheKey(scenarioHash: string, seedBase: number, modelVersion: string): string {
  return `${scenarioHash}:${seedBase}:${modelVersion}`;
}

const memoryCache = new Map<string, EnsembleResult>();
const MAX_MEMORY_ENTRIES = 200;

export function getFromMemory(scenarioHash: string, seedBase: number, modelVersion = MODEL_VERSION): EnsembleResult | undefined {
  return memoryCache.get(cacheKey(scenarioHash, seedBase, modelVersion));
}

export function putInMemory(result: EnsembleResult): void {
  const key = cacheKey(result.scenarioHash, result.seedBase, result.modelVersion);
  memoryCache.set(key, result);
  if (memoryCache.size > MAX_MEMORY_ENTRIES) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
}

export async function getFromDb(
  scenarioHash: string,
  seedBase: number,
  modelVersion = MODEL_VERSION,
): Promise<EnsembleResult | null> {
  const rows = await db
    .select()
    .from(simRuns)
    .where(
      and(
        eq(simRuns.scenarioHash, scenarioHash),
        eq(simRuns.seedBase, seedBase),
        eq(simRuns.modelVersion, modelVersion),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    scenarioHash: row.scenarioHash,
    modelVersion: row.modelVersion,
    seedBase: row.seedBase,
    runsRequested: row.runsRequested,
    runsCompleted: row.runsCompleted,
    antitheticPairs: true,
    controlVariateApplied: !!row.controlVariateDiagnostics,
    controlVariateMetric: (row.controlVariateDiagnostics as EnsembleResult["controlVariateDiagnostics"])?.metric ?? null,
    durationMs: row.durationMs,
    bands: row.bands as EnsembleResult["bands"],
    finalValues: {} as EnsembleResult["finalValues"], // not persisted (kept lean); recompute if attribution needed
    cancelled: row.cancelled,
    controlVariateDiagnostics: row.controlVariateDiagnostics as EnsembleResult["controlVariateDiagnostics"],
    antitheticDiagnostics: null, // not persisted; recompute from a fresh run if needed
  };
}

export async function persistRun(scenario: ScenarioInput, result: EnsembleResult): Promise<void> {
  putInMemory(result);
  try {
    await db
      .insert(simRuns)
      .values({
        scenarioHash: result.scenarioHash,
        seedBase: result.seedBase,
        modelVersion: result.modelVersion,
        scenarioName: scenario.name,
        scenarioDefinition: scenario,
        runsRequested: result.runsRequested,
        runsCompleted: result.runsCompleted,
        horizonWeeks: scenario.horizonWeeks,
        durationMs: result.durationMs,
        bands: result.bands,
        controlVariateDiagnostics: result.controlVariateDiagnostics,
        cancelled: result.cancelled,
      })
      .onConflictDoUpdate({
        target: [simRuns.scenarioHash, simRuns.seedBase, simRuns.modelVersion],
        set: {
          runsRequested: result.runsRequested,
          runsCompleted: result.runsCompleted,
          durationMs: result.durationMs,
          bands: result.bands,
          controlVariateDiagnostics: result.controlVariateDiagnostics,
          cancelled: result.cancelled,
        },
      });
  } catch {
    // DB persistence is best-effort for the cache; the in-memory tier and the
    // caller's freshly-computed result are still valid even if this fails
    // (e.g. DB briefly unavailable).
  }
}

export async function getCachedEnsemble(
  scenarioHash: string,
  seedBase: number,
  modelVersion = MODEL_VERSION,
): Promise<EnsembleResult | null> {
  const mem = getFromMemory(scenarioHash, seedBase, modelVersion);
  if (mem) return mem;
  const fromDb = await getFromDb(scenarioHash, seedBase, modelVersion);
  if (fromDb) {
    putInMemory(fromDb);
    return fromDb;
  }
  return null;
}
