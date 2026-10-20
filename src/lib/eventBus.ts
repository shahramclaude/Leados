// Unified realtime event bus.
//
// One logical channel per authenticated user. Events are persisted to the
// `events` table (monotonic bigserial id) *before* being fanned out to any
// live in-memory subscribers, so:
//   - Last-Event-ID resume always has a durable source of truth.
//   - A connection storm (many tabs/users) never loses events — each new
//     SSE connection replays everything after its last seen id from
//     Postgres, then attaches to the live emitter for anything new.
//
// Why SSE over WebSockets: event flow here is strictly server -> client
// (findings, approvals, task updates, anomalies, agent progress). SSE gives
// us automatic reconnection semantics (`EventSource` + `Last-Event-ID`) for
// free, works over plain HTTP/1.1 (no special infra, survives proxies far
// more reliably than WS), and needs zero bidirectional protocol — any
// client -> server actions (marking read, approving, commenting) are plain
// REST calls. See docs/REALTIME.md for the full justification.

import { EventEmitter } from "node:events";
import { db } from "@/db";
import { events } from "@/db/schema";
import { and, asc, eq, gt } from "drizzle-orm";

export type RealtimeEventType =
  | "finding.created"
  | "approval.pending"
  | "approval.decided"
  | "task.created"
  | "task.updated"
  | "metric.anomaly"
  | "agent_run.progress"
  | "agent_run.completed"
  | "notification.created"
  | "notification.updated"
  | "presence.update"
  | "comment.created"
  | "heartbeat";

export interface PublishInput {
  userId: string;
  type: RealtimeEventType;
  domain: string;
  severity?: number;
  entityType?: string;
  entityId?: string;
  dedupKey?: string;
  payload?: Record<string, unknown>;
}

export interface RealtimeEvent {
  id: number;
  userId: string;
  type: string;
  domain: string;
  severity: number;
  entityType: string | null;
  entityId: string | null;
  dedupKey: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

type Listener = (event: RealtimeEvent) => void;

const globalForBus = globalThis as typeof globalThis & {
  __leadosEventBus?: EventEmitter;
  __leadosConnectionCounts?: Map<string, number>;
};

// Many concurrent SSE connections subscribe to the same user channel during
// a connection storm — raise the default listener cap so Node doesn't warn.
const emitter = globalForBus.__leadosEventBus ?? new EventEmitter();
emitter.setMaxListeners(0);
if (!globalForBus.__leadosEventBus) globalForBus.__leadosEventBus = emitter;

const connectionCounts = globalForBus.__leadosConnectionCounts ?? new Map<string, number>();
if (!globalForBus.__leadosConnectionCounts) globalForBus.__leadosConnectionCounts = connectionCounts;

function channel(userId: string) {
  return `user:${userId}`;
}

function toRealtimeEvent(row: typeof events.$inferSelect): RealtimeEvent {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    domain: row.domain,
    severity: row.severity,
    entityType: row.entityType,
    entityId: row.entityId,
    dedupKey: row.dedupKey,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Persists an event then fans it out to any live subscribers for that user. */
export async function publishEvent(input: PublishInput): Promise<RealtimeEvent> {
  const [row] = await db
    .insert(events)
    .values({
      userId: input.userId,
      type: input.type,
      domain: input.domain,
      severity: input.severity ?? 1,
      entityType: input.entityType,
      entityId: input.entityId,
      dedupKey: input.dedupKey,
      payload: input.payload ?? {},
    })
    .returning();

  const event = toRealtimeEvent(row);
  emitter.emit(channel(input.userId), event);
  return event;
}

/** Fetches every durable event for a user strictly after `lastEventId`. */
export async function getEventsSince(userId: string, lastEventId: number): Promise<RealtimeEvent[]> {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), gt(events.id, lastEventId)))
    .orderBy(asc(events.id))
    .limit(500);
  return rows.map(toRealtimeEvent);
}

export function subscribe(userId: string, listener: Listener): () => void {
  const key = channel(userId);
  emitter.on(key, listener);
  connectionCounts.set(userId, (connectionCounts.get(userId) ?? 0) + 1);
  return () => {
    emitter.off(key, listener);
    const next = (connectionCounts.get(userId) ?? 1) - 1;
    if (next <= 0) connectionCounts.delete(userId);
    else connectionCounts.set(userId, next);
  };
}

export function getActiveConnectionCount(userId: string): number {
  return connectionCounts.get(userId) ?? 0;
}

export function getTotalActiveConnections(): number {
  let total = 0;
  for (const count of connectionCounts.values()) total += count;
  return total;
}
