// ---------------------------------------------------------------------------
// Orchestrates optimistic apply + offline persistence + server replay for a
// single mutation. This is the one path every write in the app goes through,
// so there is exactly one place where "queue state" and "UI state" can
// diverge instead of N ad-hoc fetch() calls scattered through components.
// ---------------------------------------------------------------------------

import { OfflineQueue, type QueueItem } from "./offlineQueue";
import { createIndexedDbAdapter, createMemoryAdapter, hasIndexedDb } from "./storageAdapters";
import { entityStore, type ApprovalDTO, type FindingDTO, type ObjectiveDTO } from "../../state/entityStore";
import { conflictState, errorState, optimisticState, successState, toAsyncError } from "../../state/asyncState";

type EntityDTO = ObjectiveDTO | FindingDTO | ApprovalDTO;

export interface MutationRequest {
  idempotencyKey: string;
  entityType: QueueItem["entityType"];
  entityId: string;
  label: string;
  method: "POST" | "PATCH";
  url: string;
  body: Record<string, unknown>;
  /** Produces the optimistic local entity merged with the current one. */
  applyOptimistic: (current: EntityDTO | undefined) => EntityDTO;
}

const storeKeyByEntity = { objective: "objectives", finding: "findings", approval: "approvals" } as const;

export const offlineQueue = new OfflineQueue(
  typeof window !== "undefined" && hasIndexedDb() ? createIndexedDbAdapter<QueueItem>() : createMemoryAdapter<QueueItem>(),
);

export async function enqueueMutation(request: MutationRequest) {
  const kind = storeKeyByEntity[request.entityType];
  const currentState = entityStore.get(kind, request.entityId) as
    | { data?: EntityDTO }
    | undefined;
  const optimisticEntity = request.applyOptimistic(currentState?.data);

  entityStore.put(kind, request.entityId, optimisticState(optimisticEntity) as never);

  await offlineQueue.hydrate();
  await offlineQueue.enqueue({
    idempotencyKey: request.idempotencyKey,
    entityType: request.entityType,
    label: request.label,
    method: request.method,
    url: request.url,
    body: request.body,
  });

  return trySend(request.idempotencyKey, request);
}

const inFlightMeta = new Map<string, MutationRequest>();

export async function trySend(idempotencyKey: string, request?: MutationRequest) {
  if (request) inFlightMeta.set(idempotencyKey, request);
  const meta = inFlightMeta.get(idempotencyKey);
  const item = offlineQueue.list().find((i) => i.idempotencyKey === idempotencyKey);
  if (!item || !meta) return;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await offlineQueue.updateStatus(idempotencyKey, "pending");
    return;
  }

  await offlineQueue.updateStatus(idempotencyKey, "sending");
  const kind = storeKeyByEntity[item.entityType];

  try {
    const response = await fetch(item.url, {
      method: item.method,
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify(item.body),
    });

    if (response.status === 409) {
      const payload = (await response.json()) as { current: EntityDTO };
      const mine = meta.applyOptimistic(payload.current);
      entityStore.put(
        kind,
        meta.entityId,
        conflictState(mine, payload.current, Number(item.body.expectedVersion ?? 0), payload.current.version) as never,
      );
      await offlineQueue.updateStatus(idempotencyKey, "conflict");
      return;
    }

    if (!response.ok) {
      throw response;
    }

    const payload = (await response.json()) as EntityDTO;
    entityStore.put(kind, meta.entityId, successState(payload) as never);
    await offlineQueue.remove(idempotencyKey);
    inFlightMeta.delete(idempotencyKey);
  } catch (err) {
    const asyncError = toAsyncError(err, "SERVER");
    await offlineQueue.updateStatus(idempotencyKey, "failed", asyncError.message);
    const current = entityStore.get(kind, meta.entityId) as { data?: EntityDTO } | undefined;
    entityStore.put(kind, meta.entityId, errorState(asyncError, current as never) as never);
  }
}

export async function resolveConflict(
  idempotencyKey: string,
  resolution: "mine" | "theirs" | { merged: Record<string, unknown> },
) {
  const item = offlineQueue.list().find((i) => i.idempotencyKey === idempotencyKey);
  const meta = inFlightMeta.get(idempotencyKey);
  if (!item || !meta) return;
  const kind = storeKeyByEntity[item.entityType];
  const state = entityStore.get(kind, meta.entityId) as
    | { conflict?: { mine: EntityDTO; theirs: EntityDTO; actualVersion: number } }
    | undefined;
  if (!state?.conflict) return;

  if (resolution === "theirs") {
    entityStore.put(kind, meta.entityId, successState(state.conflict.theirs) as never);
    await offlineQueue.remove(idempotencyKey);
    return;
  }

  const body =
    resolution === "mine"
      ? { ...item.body, expectedVersion: state.conflict.actualVersion }
      : { ...item.body, ...resolution.merged, expectedVersion: state.conflict.actualVersion };

  await offlineQueue.updateStatus(idempotencyKey, "pending");
  item.body = body;
  await trySend(idempotencyKey, meta);
}

export async function dismissQueueItem(idempotencyKey: string) {
  await offlineQueue.dismiss(idempotencyKey);
  inFlightMeta.delete(idempotencyKey);
}
