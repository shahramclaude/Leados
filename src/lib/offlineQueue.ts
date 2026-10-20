"use client";

// src/lib/offlineQueue.ts — queued writes with conflict resolution for the
// PWA offline story.
//
// Implementation choice: a localStorage-backed queue (not IndexedDB) that
// flushes on the browser `online` event and on next page load. This is a
// deliberate simplification over the Background Sync API: Background Sync
// has no Safari/iOS support at all (disclosed limitation, same pattern as
// `src/lib/a11y.ts`'s screen-reader self-report), so a queue that only
// flushes while the service worker is alive would silently fail to sync on
// a large share of mobile devices. A `window`-event-driven flush works
// everywhere a browser runs JavaScript, at the cost of not syncing while the
// tab is fully closed — acceptable for this slice, and documented in
// AI-SESSION-LOG.md and VERIFICATION LOG rather than silently claimed as
// full Background Sync support.

export interface QueuedMutation {
  id: string; // becomes clientMutationId
  method: "POST" | "PATCH";
  url: string;
  body: Record<string, unknown>;
  createdAt: string;
}

export interface ConflictRecord {
  mutation: QueuedMutation;
  serverRecord: unknown;
}

const QUEUE_KEY = "leados_offline_queue";
const CONFLICT_KEY = "leados_offline_conflicts";

function readList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, list: T[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("leados:offline-queue-changed"));
}

export function enqueueMutation(mutation: Omit<QueuedMutation, "createdAt">): void {
  const list = readList<QueuedMutation>(QUEUE_KEY);
  list.push({ ...mutation, createdAt: new Date().toISOString() });
  writeList(QUEUE_KEY, list);
}

export function getQueue(): QueuedMutation[] {
  return readList<QueuedMutation>(QUEUE_KEY);
}

export function getConflicts(): ConflictRecord[] {
  return readList<ConflictRecord>(CONFLICT_KEY);
}

export function resolveConflict(mutationId: string, keep: "mine" | "server"): void {
  const conflicts = getConflicts().filter((c) => c.mutation.id !== mutationId);
  writeList(CONFLICT_KEY, conflicts);
  if (keep === "mine") {
    // Re-queue with a fresh mutation id so the retried write is treated as new.
    const original = getConflicts().find((c) => c.mutation.id === mutationId);
    if (original) enqueueMutation({ ...original.mutation, id: crypto.randomUUID() });
  }
}

export async function flushQueue(): Promise<{ flushed: number; conflicts: number }> {
  if (typeof window === "undefined" || !navigator.onLine) return { flushed: 0, conflicts: 0 };

  const queue = getQueue();
  if (queue.length === 0) return { flushed: 0, conflicts: 0 };

  const remaining: QueuedMutation[] = [];
  const newConflicts: ConflictRecord[] = [];
  let flushed = 0;

  for (const mutation of queue) {
    try {
      const res = await fetch(mutation.url, {
        method: mutation.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mutation.body),
      });
      if (res.status === 409) {
        const serverRecord = await res.json();
        newConflicts.push({ mutation, serverRecord });
      } else if (!res.ok) {
        remaining.push(mutation); // transient failure — retry next flush
      } else {
        flushed += 1;
      }
    } catch {
      remaining.push(mutation); // offline again mid-flush
    }
  }

  writeList(QUEUE_KEY, remaining);
  if (newConflicts.length > 0) {
    writeList(CONFLICT_KEY, [...getConflicts(), ...newConflicts]);
  }

  return { flushed, conflicts: newConflicts.length };
}

export function initOfflineQueueAutoFlush(): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => void flushQueue();
  window.addEventListener("online", handler);
  void flushQueue();
  return () => window.removeEventListener("online", handler);
}
