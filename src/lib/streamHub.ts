// LEADOS Part 14 — stream hub: connection registry + backpressure policy.
//
// Deliberately decoupled from the Web Streams API / Next.js route handler so
// the backpressure and scoping behavior can be unit-tested with a fake sink
// (see scripts/tests/storm-and-backpressure.test.ts) instead of only being
// exercisable over real HTTP.
import { getFramesSince, scopedTopics, type StoredFrame } from "./eventStore";
import { subscribeFrames } from "./eventBus";

export interface Sink {
  /** Write one already-encoded SSE chunk. Must not throw on a closed connection. */
  write(chunk: string): void;
  /** Whether the consumer side is backed up (should shed non-critical load). */
  isBackedUp(): boolean;
  /** True once the underlying transport is gone; hub stops writing. */
  isClosed(): boolean;
}

// Frame types that must NEVER be dropped under backpressure, regardless of
// queue depth — approvals are decisions, not FYI.
const CRITICAL_TYPES = new Set(["approval"]);

export function encodeFrame(frame: StoredFrame): string {
  const lines = [`id: ${frame.id}`, `event: ${frame.type}`, `data: ${JSON.stringify(frame)}`, "", ""];
  return lines.join("\n");
}

export function encodeComment(comment: string): string {
  return `: ${comment}\n\n`;
}

export interface ConnectionStats {
  id: string;
  topics: string[];
  delivered: number;
  dropped: number;
  openedAt: number;
}

class StreamConnection {
  readonly id: string;
  readonly topics: Set<string>;
  private sink: Sink;
  private droppedSinceLastNotice = 0;
  private deliveredCount = 0;
  private droppedCount = 0;
  readonly openedAt = Date.now();
  private unsubscribe: (() => void) | null = null;
  private lastDeliveredId: bigint = BigInt(0);

  constructor(id: string, topics: string[], sink: Sink) {
    this.id = id;
    this.topics = new Set(topics);
    this.sink = sink;
  }

  get stats(): ConnectionStats {
    return {
      id: this.id,
      topics: [...this.topics],
      delivered: this.deliveredCount,
      dropped: this.droppedCount,
      openedAt: this.openedAt,
    };
  }

  /** Deliver a historical (catch-up) frame. Never dropped — bounded by the query LIMIT instead. */
  deliverCatchUp(frame: StoredFrame): void {
    if (!this.topics.has(frame.topic)) return;
    this.writeFrame(frame);
  }

  /** Deliver a live frame, applying the backpressure policy. */
  deliverLive(frame: StoredFrame): void {
    if (!this.topics.has(frame.topic)) return; // scoping: role-invisible frames never delivered
    const critical = CRITICAL_TYPES.has(frame.type);
    if (!critical && this.sink.isBackedUp()) {
      this.droppedSinceLastNotice += 1;
      this.droppedCount += 1;
      return;
    }
    if (this.droppedSinceLastNotice > 0) {
      const notice: StoredFrame = {
        id: frame.id,
        orgId: frame.orgId,
        topic: frame.topic,
        type: "lag_notice",
        payload: { droppedCount: this.droppedSinceLastNotice, reason: "consumer backpressure" },
        dedupeKey: null,
        createdAt: new Date().toISOString(),
      };
      this.sink.write(encodeFrame(notice));
      this.droppedSinceLastNotice = 0;
    }
    this.writeFrame(frame);
  }

  private writeFrame(frame: StoredFrame): void {
    if (this.sink.isClosed()) return;
    this.sink.write(encodeFrame(frame));
    this.deliveredCount += 1;
    const idNum = BigInt(frame.id);
    if (idNum > this.lastDeliveredId) this.lastDeliveredId = idNum;
  }

  attachLiveSubscription(predicate: (frame: StoredFrame) => boolean = () => true): void {
    this.unsubscribe = subscribeFrames((frame) => {
      if (!predicate(frame)) return;
      this.deliverLive(frame);
    });
  }

  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}

const globalForHub = globalThis as typeof globalThis & {
  __leadosConnections?: Map<string, StreamConnection>;
};

const connections = globalForHub.__leadosConnections ?? new Map<string, StreamConnection>();
if (process.env.NODE_ENV !== "production") {
  globalForHub.__leadosConnections = connections;
}

let connectionSeq = 0;

export interface OpenConnectionOptions {
  orgId: string;
  userId: string;
  role: string;
  topics?: string[]; // explicit override (tests); defaults to scopedTopics()
  lastEventId: bigint | null;
  sink: Sink;
  catchUpLimit?: number;
}

/**
 * Open a scoped, resumable connection: replays any missed frames since
 * `lastEventId` from the durable outbox, then subscribes to the live bus.
 * Returns a handle with `close()` to unsubscribe and `stats` for monitoring.
 */
export async function openConnection(opts: OpenConnectionOptions): Promise<{ id: string; close: () => void; stats: () => ConnectionStats }> {
  const topics = opts.topics ?? scopedTopics(opts.orgId, opts.userId, opts.role);
  const id = `conn_${Date.now()}_${++connectionSeq}`;
  const conn = new StreamConnection(id, topics, opts.sink);
  connections.set(id, conn);

  const missed = await getFramesSince(topics, opts.lastEventId, opts.catchUpLimit ?? 500);
  for (const frame of missed) {
    conn.deliverCatchUp(frame);
  }

  conn.attachLiveSubscription();

  return {
    id,
    close: () => {
      conn.close();
      connections.delete(id);
    },
    stats: () => conn.stats,
  };
}

export function hubStats() {
  const all = [...connections.values()].map((c) => c.stats);
  return {
    activeConnections: all.length,
    totalDelivered: all.reduce((s, c) => s + c.delivered, 0),
    totalDropped: all.reduce((s, c) => s + c.dropped, 0),
    memoryRss: process.memoryUsage().rss,
    connections: all,
  };
}

// Exported for unit tests that want to exercise StreamConnection directly
// without going through the module-level registry.
export const __internal = { StreamConnection };
