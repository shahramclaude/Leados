// LEADOS Part 14 — in-process realtime fan-out bus.
// Single-process pub/sub (EventEmitter) used to push durably-stored frames to
// live SSE connections without re-polling Postgres. Cached on globalThis so
// Next.js dev-mode hot reload doesn't create duplicate emitters/listener leak
// warnings. For multi-process deployment this would be swapped for a
// Postgres LISTEN/NOTIFY or Redis pub/sub backend — the StoredFrame contract
// is unchanged either way, so no caller code would need to change.
import { EventEmitter } from "node:events";
import type { StoredFrame } from "./eventStore";

const globalForBus = globalThis as typeof globalThis & {
  __leadosEventBus?: EventEmitter;
};

export const bus =
  globalForBus.__leadosEventBus ??
  (() => {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0); // unbounded: one listener per live SSE connection
    return emitter;
  })();

if (process.env.NODE_ENV !== "production") {
  globalForBus.__leadosEventBus = bus;
}

const FRAME_EVENT = "frame";

export function publishFrame(frame: StoredFrame): void {
  bus.emit(FRAME_EVENT, frame);
}

export function subscribeFrames(listener: (frame: StoredFrame) => void): () => void {
  bus.on(FRAME_EVENT, listener);
  return () => bus.off(FRAME_EVENT, listener);
}

export function currentListenerCount(): number {
  return bus.listenerCount(FRAME_EVENT);
}
