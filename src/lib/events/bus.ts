import { EventEmitter } from "events";

/**
 * In-process realtime bus backing the public SSE stream (Part 14). Every
 * durable webhook event (see lib/webhooks/worker.ts emitEvent) is also
 * published here so authenticated stream subscribers see it live.
 *
 * LIMITATION: single-process, in-memory — matches the rate limiter's
 * documented scope-of-guarantee for this part. A multi-instance deployment
 * would back this with Postgres LISTEN/NOTIFY or a message broker.
 */
export type BusEvent = { id: string; type: string; data: unknown; ts: string };

class EventBus extends EventEmitter {
  publish(evt: BusEvent) {
    this.emit("event", evt);
  }
}

export const eventBus = new EventBus();
eventBus.setMaxListeners(100);
