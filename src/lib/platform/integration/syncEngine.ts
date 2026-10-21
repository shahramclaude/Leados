"use client";

// ---------------------------------------------------------------------------
// Drives the offline queue: hydrates on boot, replays in causation order on
// reconnect (never in parallel — causation order matters, e.g. "create
// objective" must land before "add finding to objective"). Surfaces status
// via the same offlineQueue subscription the SyncDrawer reads.
// ---------------------------------------------------------------------------

import { offlineQueue, trySend } from "./mutationQueue";

let started = false;

export function startSyncEngine() {
  if (started || typeof window === "undefined") return;
  started = true;

  void offlineQueue.hydrate().then(() => drain());

  window.addEventListener("online", () => void drain());
}

export async function drain() {
  await offlineQueue.hydrate();
  const items = offlineQueue.list().filter((i) => i.status === "pending" || i.status === "failed");
  for (const item of items) {
    // Sequential by design: causation order must be preserved on replay.
    // eslint-disable-next-line no-await-in-loop
    await trySend(item.idempotencyKey, {
      idempotencyKey: item.idempotencyKey,
      entityType: item.entityType,
      entityId: String(item.body.id ?? ""),
      label: item.label,
      method: item.method,
      url: item.url,
      body: item.body,
      applyOptimistic: (current) => ({ ...(current as object), ...item.body }) as never,
    });
  }
}

export function getQueueSnapshot() {
  return offlineQueue.list();
}

export function subscribeQueue(listener: () => void) {
  return offlineQueue.subscribe(listener);
}
