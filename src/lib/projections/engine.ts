// LEADOS Part 01 — the projection engine.
//
// Formalizes the projector pattern used across all 8 domains. A projector is
// a PURE, DETERMINISTIC fold from (current per-entity state, one event) to
// (next per-entity state). Determinism matters because `rebuildProjections()`
// must produce byte-identical output every time it replays the same log —
// this is checked by the determinism test (src/lib/projections/__tests__).
//
// Two execution modes:
//  1. Synchronous-on-write: `applyEnvelopeSync(tx, envelope)` runs inside the
//     SAME DB transaction as the event insert (wired up in eventStore.ts via
//     an eventBus subscriber). Every projector in this repo is "hot" — the
//     dataset size does not yet justify a cold/async tier — so this always
//     runs all interested projectors. If a future part adds an expensive
//     projector, give it `hot: false` and a scheduled drain job; the
//     interface already supports filtering on it (see `hotProjectors()`).
//  2. rebuildProjections(): drops ALL projection_state + checkpoints and
//     recomputes everything from the log, in one pass, in memory, then
//     flushes once. This is what detects drift between "what synchronous
//     writes produced over time" and "what pure replay produces now".

import { db } from "@/db";
import type { EventEnvelope } from "@/lib/events/types";
import type { Executor } from "@/lib/platform/eventRepository";
import { replayAllEvents } from "@/lib/platform/eventRepository";
import {
  advanceCheckpoint,
  clearAllProjectionState,
  getProjectionRow,
  listAllProjectionRows,
  resetCheckpoint,
  upsertProjectionRow,
} from "@/lib/platform/projectionRepository";
import { hashProjectionRows } from "@/lib/events/eventUtils";

export interface Projector<TState = unknown> {
  /** Checkpoint key. Must be stable forever once shipped — renaming a
   * projector is equivalent to retiring one and launching a new one. */
  name: string;
  /** Event types this projector folds. Must be a subset of EVENT_TYPE_IDS. */
  interestedIn: string[];
  /** State for an entity this projector has never seen. */
  initial: TState;
  /** Pure function: no I/O, no Date.now(), no randomness. Everything the
   * projector needs must come from `state` and `e`. */
  apply(state: TState, e: EventEnvelope): TState;
  /** Whether this projector runs synchronously inside the write transaction.
   * All Part 01 projectors are hot (true); kept explicit for future parts. */
  hot?: boolean;
}

const registry = new Map<string, Projector<any>>();

export function registerProjector(projector: Projector<any>): void {
  if (registry.has(projector.name)) {
    throw new Error(`Projector "${projector.name}" is already registered`);
  }
  registry.set(projector.name, projector);
}

export function getRegisteredProjectors(): Projector<any>[] {
  return Array.from(registry.values());
}

export function hotProjectors(): Projector<any>[] {
  return getRegisteredProjectors().filter((p) => p.hot !== false);
}

/** Apply one freshly-appended event to every interested HOT projector,
 * inside the given transaction executor. Called by eventStore.ts right
 * after the event row (and outbox row, if any) are inserted. */
export async function applyEnvelopeSync(ex: Executor, envelope: EventEnvelope): Promise<void> {
  for (const projector of hotProjectors()) {
    if (!projector.interestedIn.includes(envelope.type)) continue;
    const existing = await getProjectionRow(ex, projector.name, envelope.entityId);
    const prevState = (existing?.state as unknown) ?? projector.initial;
    const nextState = projector.apply(prevState, envelope);
    await upsertProjectionRow(ex, {
      projectorName: projector.name,
      entityId: envelope.entityId,
      orgId: envelope.orgId,
      state: nextState,
    });
    await advanceCheckpoint(ex, projector.name, envelope.eventId, 1);
  }
}

export type RebuildReport = {
  stateHash: string;
  perProjector: Record<string, { entityCount: number; eventsApplied: number; lastEventId: string | null }>;
  totalEventsReplayed: number;
};

/**
 * Drop and recompute ALL projections from the log. Single in-memory pass
 * (fine at this dataset scale — see docs/DATA.md for the scale note), then
 * one flush transaction. Returns a deterministic hash of the resulting
 * projection_state so callers (scripts/rebuild.ts, the determinism test) can
 * compare two runs without diffing raw rows.
 */
export async function rebuildProjections(): Promise<RebuildReport> {
  const allProjectors = getRegisteredProjectors();
  const allEvents = await replayAllEvents();

  // projectorName -> entityId -> { orgId, state }
  const memo = new Map<string, Map<string, { orgId: string; state: unknown }>>();
  const eventsApplied: Record<string, number> = {};
  const lastEventId: Record<string, string | null> = {};
  for (const p of allProjectors) {
    memo.set(p.name, new Map());
    eventsApplied[p.name] = 0;
    lastEventId[p.name] = null;
  }

  for (const envelope of allEvents) {
    for (const projector of allProjectors) {
      if (!projector.interestedIn.includes(envelope.type)) continue;
      const entityMap = memo.get(projector.name)!;
      const prevState = entityMap.get(envelope.entityId)?.state ?? projector.initial;
      const nextState = projector.apply(prevState, envelope);
      entityMap.set(envelope.entityId, { orgId: envelope.orgId, state: nextState });
      eventsApplied[projector.name] += 1;
      lastEventId[projector.name] = envelope.eventId;
    }
  }

  await db.transaction(async (tx) => {
    await clearAllProjectionState(tx);
    for (const projector of allProjectors) {
      await resetCheckpoint(tx, projector.name);
      const entityMap = memo.get(projector.name)!;
      for (const [entityId, { orgId, state }] of entityMap) {
        await upsertProjectionRow(tx, { projectorName: projector.name, entityId, orgId, state });
      }
      if (lastEventId[projector.name]) {
        await advanceCheckpoint(tx, projector.name, lastEventId[projector.name]!, eventsApplied[projector.name]);
      }
    }
  });

  const finalRows = await listAllProjectionRows();
  const stateHash = hashProjectionRows(finalRows);

  const perProjector: RebuildReport["perProjector"] = {};
  for (const p of allProjectors) {
    perProjector[p.name] = {
      entityCount: memo.get(p.name)!.size,
      eventsApplied: eventsApplied[p.name],
      lastEventId: lastEventId[p.name],
    };
  }

  return { stateHash, perProjector, totalEventsReplayed: allEvents.length };
}

/** Hash of the CURRENT projection_state table, without rebuilding — used to
 * compare "before" vs "after" in scripts/rebuild.ts. */
export async function currentProjectionHash(): Promise<string> {
  const rows = await listAllProjectionRows();
  return hashProjectionRows(rows);
}
