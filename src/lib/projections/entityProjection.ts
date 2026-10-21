import { ENTITY_EVENT_TYPES } from "../platform/events/eventTypes";
import type { EventEnvelope } from "../platform/events/envelope";

// This is the pure, total fold at the heart of the system:
//
//   state = events.sortBy(occurredAt, recordedAt, seq).reduce(apply, initial)
//
// `apply` is pure (no I/O, no Date.now(), no randomness) and total (it has a
// defined result for every event, including event types it doesn't
// recognise — the default branch returns state unchanged). Totality is what
// makes forward-compatible schema evolution safe: an old projector replaying
// a stream that contains a newer event type it doesn't understand yet simply
// skips it instead of crashing.

export type ProjectionState = {
  entityType: string;
  entityId: string;
  orgId: string;
  version: number;
  validFrom: string;
  validTo: string | null;
  deletedAt: string | null;
  data: Record<string, unknown>;
} | null;

export function apply(state: ProjectionState, event: EventEnvelope): ProjectionState {
  switch (event.eventType) {
    case ENTITY_EVENT_TYPES.created: {
      const payload = event.payload as { entity: Record<string, unknown> };
      return {
        entityType: event.entityType,
        entityId: event.entityId,
        orgId: event.orgId,
        version: 1,
        validFrom: event.occurredAt,
        validTo: null,
        deletedAt: null,
        data: payload.entity,
      };
    }
    case ENTITY_EVENT_TYPES.updated: {
      if (!state) return state; // out-of-order/unknown entity: ignore, stay total
      const payload = event.payload as { patch: Record<string, unknown> };
      return {
        ...state,
        version: state.version + 1,
        validFrom: event.occurredAt,
        data: { ...state.data, ...payload.patch },
      };
    }
    case ENTITY_EVENT_TYPES.deleted: {
      if (!state) return state;
      return { ...state, version: state.version + 1, validFrom: event.occurredAt, deletedAt: event.occurredAt };
    }
    case ENTITY_EVENT_TYPES.restored: {
      if (!state) return state;
      return { ...state, version: state.version + 1, validFrom: event.occurredAt, deletedAt: null };
    }
    default:
      // Unknown event type (e.g. a future schema version this build predates).
      // Total function: no throw, state passes through unchanged.
      return state;
  }
}

/** Stable sort key: occurredAt, then recordedAt, then seq (tie-breaker). */
export function eventSortKey(e: Pick<EventEnvelope, "occurredAt" | "recordedAt" | "seq">): string {
  const occurred = new Date(e.occurredAt).getTime();
  const recorded = new Date(e.recordedAt).getTime();
  return [
    occurred.toString().padStart(20, "0"),
    recorded.toString().padStart(20, "0"),
    e.seq.toString().padStart(20, "0"),
  ].join("|");
}

export function sortEvents<T extends Pick<EventEnvelope, "occurredAt" | "recordedAt" | "seq">>(events: T[]): T[] {
  return events.slice().sort((a, b) => (eventSortKey(a) < eventSortKey(b) ? -1 : eventSortKey(a) > eventSortKey(b) ? 1 : 0));
}

/** Fold a full (or partial) event stream for ONE entity into its current state. */
export function fold(events: EventEnvelope[], initial: ProjectionState = null): ProjectionState {
  return sortEvents(events).reduce(apply, initial);
}

/**
 * Fold a mixed event stream spanning MANY entities into a map of
 * entityType/entityId -> state. Events are grouped by entity first, then
 * each group is sorted and folded independently — this is what makes the
 * overall fold order-stable under permutation of events belonging to
 * different (independent) entities: only intra-entity order matters.
 */
export function foldByEntity(events: EventEnvelope[]): Map<string, ProjectionState> {
  const byEntity = new Map<string, EventEnvelope[]>();
  for (const e of events) {
    const key = `${e.orgId}::${e.entityType}::${e.entityId}`;
    const list = byEntity.get(key) ?? [];
    list.push(e);
    byEntity.set(key, list);
  }
  const result = new Map<string, ProjectionState>();
  for (const [key, group] of byEntity) {
    result.set(key, fold(group));
  }
  return result;
}
