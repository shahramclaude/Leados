// In-process pub/sub fan-out for live SSE subscribers.
//
// This is deliberately NOT the source of truth (the outbox table is). It
// exists purely so that already-connected streams get new frames without
// polling the database on a tight loop. Every frame published here was
// already durably committed to `event_outbox` by eventStore.appendEvent
// before this function is called, so a process crash between "durable
// write" and "in-memory publish" only ever costs a live push — the next
// reconnect (or even the same connection's periodic backfill-check) will
// still pick the frame up from the database. No event is ever lost, only
// potentially delayed.

import { EventEmitter } from "node:events";
import type { StreamFrame } from "@/lib/eventStore";

type Listener = (frame: StreamFrame) => void;

const globalForBus = globalThis as typeof globalThis & {
  __leadosEventBus?: EventEmitter;
};

const emitter = globalForBus.__leadosEventBus ?? new EventEmitter();
emitter.setMaxListeners(0); // many concurrent SSE connections expected

if (process.env.NODE_ENV !== "production") {
  globalForBus.__leadosEventBus = emitter;
}

const CHANNEL = "frame";

export function publish(frame: StreamFrame): void {
  emitter.emit(CHANNEL, frame);
}

export function subscribe(listener: Listener): () => void {
  emitter.on(CHANNEL, listener);
  return () => emitter.off(CHANNEL, listener);
}

export function listenerCount(): number {
  return emitter.listenerCount(CHANNEL);
}
