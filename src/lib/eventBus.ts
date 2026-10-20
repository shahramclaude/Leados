// LEADOS Part 01 — in-process synchronous event bus.
//
// Scope and relationship to the outbox (src/db/schema.ts `outbox` table):
//  - eventBus is IN-PROCESS and SYNCHRONOUS. It exists purely to decouple
//    "an event was appended" from "projectors that react to it", so the
//    projection engine (src/lib/projections/engine.ts) does not need to be
//    imported by src/lib/eventStore.ts directly. It gives no durability, no
//    cross-process delivery, and no retry — if the process crashes between
//    commit and a subscriber running, the subscriber's work is simply re-run
//    by the next `rebuildProjections()`.
//  - outbox is DURABLE and CROSS-PROCESS. It is a real table, written in the
//    same DB transaction as the event insert, and is the interface Part 12
//    (realtime/notifications) will poll/drain. Nothing about its delivery
//    depends on this process staying alive.
//  - eventStore.ts uses eventBus for "run the hot projectors right now,
//    inside today's request" and uses the outbox table for "tell whatever
//    external system cares later".
//
// This is intentionally the *only* publish/subscribe mechanism in the repo;
// do not add a second ad-hoc event emitter elsewhere.

import type { EventEnvelope } from "./events/types";

type Listener = (envelope: EventEnvelope) => void | Promise<void>;

class EventBus {
  private listeners: Listener[] = [];

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Publish is awaited by the caller (eventStore) so that "synchronous on
   * write" projections are guaranteed to have run before the API response
   * is sent, while still being a plain async function call rather than a
   * second transaction. */
  async publish(envelope: EventEnvelope): Promise<void> {
    for (const listener of this.listeners) {
      await listener(envelope);
    }
  }

  /** Test-only: remove all listeners (used between vitest cases). */
  reset(): void {
    this.listeners = [];
  }
}

export const eventBus = new EventBus();
