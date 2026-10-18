// ─────────────────────────────────────────────────────────────────────────
// In-process pub/sub used to fan background-intelligence events out to every
// open SSE connection in this server process. Stored on `globalThis` so it
// survives Next.js dev-mode module reloads.
// ─────────────────────────────────────────────────────────────────────────
import { EventEmitter } from "node:events";

export type StreamEventType = "finding" | "work_item" | "notification" | "run";

export interface StreamEvent {
  type: StreamEventType;
  action: string; // e.g. "new" | "resolved" | "created" | "updated"
  payload: unknown;
  ts: string;
}

const globalForBus = globalThis as typeof globalThis & {
  __leadosEventBus?: EventEmitter;
};

export const eventBus =
  globalForBus.__leadosEventBus ??
  (() => {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    return emitter;
  })();

if (process.env.NODE_ENV !== "production") {
  globalForBus.__leadosEventBus = eventBus;
}

const CHANNEL = "leados:stream";

export function publishStreamEvent(event: Omit<StreamEvent, "ts">) {
  const full: StreamEvent = { ...event, ts: new Date().toISOString() };
  eventBus.emit(CHANNEL, full);
}

export function subscribeStreamEvents(listener: (event: StreamEvent) => void): () => void {
  eventBus.on(CHANNEL, listener);
  return () => eventBus.off(CHANNEL, listener);
}
