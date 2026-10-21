"use client";

import { get, set } from "idb-keyval";

/**
 * Client-side offline write queue (Section D). Writes made while offline
 * (or that fail with a network error) are appended here instead of lost,
 * and flushed through `/api/sync` on reconnect. See `src/app/api/sync/route.ts`
 * for the server-side conflict semantics this protocol implements.
 */
export type QueuedMutation = {
  clientId: string;
  entityType: "subject" | "briefing";
  entityId: string;
  patch: Record<string, unknown>;
  baseVersion: number;
  resolution?: "keepMine" | "keepTheirs";
  label: string; // human-readable summary for the "queued changes" UI
  queuedAt: string;
};

export type ConflictMutation = QueuedMutation & { server: Record<string, unknown> };

const QUEUE_KEY = "leados.offline.queue.v1";
const CONFLICT_KEY = "leados.offline.conflicts.v1";

export async function getQueue(): Promise<QueuedMutation[]> {
  return (await get(QUEUE_KEY)) ?? [];
}

export async function enqueueMutation(mutation: QueuedMutation): Promise<void> {
  const queue = await getQueue();
  queue.push(mutation);
  await set(QUEUE_KEY, queue);
}

export async function clearQueueEntries(clientIds: string[]): Promise<void> {
  const queue = await getQueue();
  await set(QUEUE_KEY, queue.filter((m) => !clientIds.includes(m.clientId)));
}

export async function getConflicts(): Promise<ConflictMutation[]> {
  return (await get(CONFLICT_KEY)) ?? [];
}

export async function addConflict(conflict: ConflictMutation): Promise<void> {
  const conflicts = await getConflicts();
  await set(CONFLICT_KEY, [...conflicts.filter((c) => c.clientId !== conflict.clientId), conflict]);
}

export async function resolveConflict(clientId: string): Promise<void> {
  const conflicts = await getConflicts();
  await set(CONFLICT_KEY, conflicts.filter((c) => c.clientId !== clientId));
}

export type SyncSummary = { applied: number; discarded: number; conflicts: number; forbidden: number; notFound: number };

/**
 * Flushes the queue against `/api/sync`. Conflicts are moved to the
 * conflict bucket (not retried automatically) so a human resolves them —
 * this is the "user-facing conflict resolution on reconnect" the mandate
 * requires instead of last-writer-wins.
 */
export async function flushQueue(): Promise<SyncSummary> {
  const queue = await getQueue();
  const summary: SyncSummary = { applied: 0, discarded: 0, conflicts: 0, forbidden: 0, notFound: 0 };
  if (queue.length === 0) return summary;

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mutations: queue }),
  });
  if (!response.ok) return summary;
  const { results } = (await response.json()) as {
    results: { clientId: string; status: string; server?: Record<string, unknown> }[];
  };

  const toClear: string[] = [];
  for (const result of results) {
    const original = queue.find((m) => m.clientId === result.clientId);
    if (!original) continue;
    if (result.status === "applied") {
      summary.applied += 1;
      toClear.push(result.clientId);
    } else if (result.status === "discarded") {
      summary.discarded += 1;
      toClear.push(result.clientId);
    } else if (result.status === "conflict") {
      summary.conflicts += 1;
      await addConflict({ ...original, server: result.server ?? {} });
      toClear.push(result.clientId);
    } else if (result.status === "forbidden") {
      summary.forbidden += 1;
      toClear.push(result.clientId);
    } else if (result.status === "not_found") {
      summary.notFound += 1;
      toClear.push(result.clientId);
    }
  }
  await clearQueueEntries(toClear);
  return summary;
}

/** Re-submits a resolved conflict with the user's chosen resolution. */
export async function submitConflictResolution(conflict: ConflictMutation, resolution: "keepMine" | "keepTheirs") {
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mutations: [{ ...conflict, resolution }],
    }),
  });
  const { results } = await response.json();
  if (results?.[0]?.status === "applied" || results?.[0]?.status === "discarded") {
    await resolveConflict(conflict.clientId);
  }
  return results?.[0];
}
