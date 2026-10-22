"use client";

import { dbAll, dbDelete, dbPut, type QueuedWrite } from "./db";

// Tiny pub-sub so React components (the sync drawer) can re-render whenever
// the queue changes, without pulling in a state-management dependency.
export const queueEvents = new EventTarget();
function notify() {
  queueEvents.dispatchEvent(new Event("change"));
}

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Attempts a write immediately. If the network is unavailable, the write is
 * persisted to IndexedDB and surfaced in the sync drawer instead of being
 * silently lost. Returns a discriminated result so callers can update
 * optimistic UI either way.
 */
export async function performOrQueueWrite(input: {
  method: "POST" | "PATCH" | "DELETE";
  url: string;
  body?: unknown;
  description: string;
}): Promise<{ status: "ok"; data: unknown } | { status: "queued" } | { status: "conflict"; data: unknown }> {
  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: { "Content-Type": "application/json" },
      body: input.body ? JSON.stringify(input.body) : undefined,
    });

    if (response.status === 409) {
      const data = await response.json();
      return { status: "conflict", data };
    }

    if (!response.ok) throw new Error(`http-${response.status}`);

    const data = response.status === 204 ? null : await response.json().catch(() => null);
    return { status: "ok", data };
  } catch (err) {
    // Network failure (offline) — queue it.
    if (isNetworkError(err)) {
      const item: QueuedWrite = {
        id: uuid(),
        method: input.method,
        url: input.url,
        body: input.body,
        description: input.description,
        createdAt: Date.now(),
        status: "queued",
      };
      await dbPut(item);
      notify();
      return { status: "queued" };
    }
    throw err;
  }
}

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && err.message === "Failed to fetch");
}

export async function listQueue(): Promise<QueuedWrite[]> {
  return (await dbAll()).sort((a, b) => a.createdAt - b.createdAt);
}

/** Replays every queued write in order. Stops a given item at the first conflict so the user can resolve it. */
export async function flushQueue(): Promise<void> {
  const items = await listQueue();
  for (const item of items) {
    if (item.status === "conflict") continue; // needs explicit user resolution first
    await dbPut({ ...item, status: "syncing" });
    notify();

    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        body: item.body ? JSON.stringify(item.body) : undefined,
      });

      if (response.status === 409) {
        const data = await response.json();
        await dbPut({ ...item, status: "conflict", conflict: data });
        notify();
        continue;
      }

      if (!response.ok) throw new Error(`http-${response.status}`);

      await dbDelete(item.id);
      notify();
    } catch (err) {
      if (isNetworkError(err)) {
        await dbPut({ ...item, status: "queued" }); // still offline, try again later
        notify();
        return; // stop — we're offline again
      }
      await dbPut({ ...item, status: "failed", error: String(err) });
      notify();
    }
  }
}

export type ConflictResolution = "mine" | "theirs" | "merge";

/**
 * Explicit, user-driven conflict resolution. Never automatic. `mine`
 * re-submits the local params against the server's current version;
 * `theirs` discards the local change; `merge` shallow-merges local fields
 * over the server's record (still with user confirmation in the UI).
 */
export async function resolveConflict(id: string, resolution: ConflictResolution): Promise<void> {
  const items = await listQueue();
  const item = items.find((i) => i.id === id);
  if (!item || !item.conflict) return;

  if (resolution === "theirs") {
    await dbDelete(id);
    notify();
    return;
  }

  const serverRecord = item.conflict.serverRecord as { version: number; params: Record<string, unknown> };
  const attempted = item.conflict.attemptedParams as Record<string, unknown>;
  const mergedParams = resolution === "mine" ? attempted : { ...serverRecord.params, ...attempted };

  const retryBody = { expectedVersion: serverRecord.version, params: mergedParams };

  const response = await fetch(item.url, {
    method: item.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(retryBody),
  });

  if (response.status === 409) {
    const data = await response.json();
    await dbPut({ ...item, status: "conflict", conflict: data, body: retryBody });
    notify();
    return;
  }

  await dbDelete(id);
  notify();
}

/**
 * Same mine/theirs/merge semantics as `resolveConflict`, but for a conflict
 * that just happened on an *online* submit (HTTP 409 came back immediately
 * rather than being discovered later during a queue replay). Used by
 * EngineRecordCard so online and offline conflicts share one code path.
 */
export async function resolveConflictNow(
  url: string,
  method: "PATCH",
  serverRecord: { version: number; params: Record<string, unknown> },
  attemptedParams: Record<string, unknown>,
  resolution: ConflictResolution,
): Promise<{ status: "ok" | "conflict"; data: unknown }> {
  if (resolution === "theirs") {
    return { status: "ok", data: serverRecord };
  }

  const mergedParams = resolution === "mine" ? attemptedParams : { ...serverRecord.params, ...attemptedParams };
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion: serverRecord.version, params: mergedParams }),
  });

  if (response.status === 409) {
    const data = await response.json();
    return { status: "conflict", data };
  }

  return { status: "ok", data: await response.json() };
}

export function initAutoFlush() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => void flushQueue());
  if (navigator.onLine) void flushQueue();
}
