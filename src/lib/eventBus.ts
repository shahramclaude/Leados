// Minimal in-process event bus / stream hub. Backs SSE-style subscriptions
// and the `stream_connections_active` gauge + health check. A real
// multi-instance deployment would back this with Redis pub/sub or similar;
// documented as a known limitation in docs/RUNBOOKS.md and the Phase 5
// "what we deliberately did not do" section.
import { EventEmitter } from "node:events";
import { registry } from "./metrics";
import { setSetting } from "./settings";
import { STREAM_HUB_KEY } from "./settings";

type Listener = (event: { type: string; data: unknown }) => void;

const globalForBus = globalThis as typeof globalThis & {
  __leadosEventBus?: {
    emitter: EventEmitter;
    connections: Set<symbol>;
  };
};

function build() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(1000);
  return { emitter, connections: new Set<symbol>() };
}

const bus = globalForBus.__leadosEventBus ?? build();
if (process.env.NODE_ENV !== "production") {
  globalForBus.__leadosEventBus = bus;
}

function refreshGauge() {
  registry.streamConnectionsActive.set({}, bus.connections.size);
}

/** Register a new stream connection (e.g. an SSE client). Returns an unsubscribe fn. */
export function connectStream(onEvent: Listener): () => void {
  const id = Symbol("stream-connection");
  bus.connections.add(id);
  refreshGauge();
  bus.emitter.on("event", onEvent);
  return () => {
    bus.connections.delete(id);
    bus.emitter.off("event", onEvent);
    refreshGauge();
  };
}

export function publish(type: string, data: unknown): void {
  bus.emitter.emit("event", { type, data });
}

export function activeStreamCount(): number {
  return bus.connections.size;
}

/** Persist the current connection count so the graceful-shutdown drain poll
 * (which runs in a separate `server.js` process context) can see it. */
export async function heartbeatStreamHub(): Promise<void> {
  await setSetting(STREAM_HUB_KEY, {
    activeConnections: bus.connections.size,
    heartbeatAt: new Date().toISOString(),
  });
}

refreshGauge();
