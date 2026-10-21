import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";

// ---------------------------------------------------------------------------
// Part 12's realtime stream exposed as a documented public API (Section D).
//
// Delivery model: every mutation calls `emitEvent()` which (a) durably
// appends a row to `events` (monotonic `seq` column) and (b) pushes to any
// in-process SSE subscribers for that org. A client that reconnects passes
// `?cursor=<seq>` and the handler first replays everything with
// `seq > cursor` from the database before attaching the live in-memory feed,
// so no events are lost across a reconnect (bounded by retention of the
// `events` table). This is the "one job interface" used by both the human
// dashboard and external automation subscribers.
// ---------------------------------------------------------------------------

export type StreamEventType =
  | "lead.created"
  | "lead.updated"
  | "lead.deleted"
  | "account.created"
  | "account.updated"
  | "account.deleted"
  | "automation.run.started"
  | "automation.run.succeeded"
  | "automation.run.failed"
  | "webhook.delivery.updated";

export interface StreamEvent {
  type: StreamEventType | string;
  payload: unknown;
}

type Subscriber = (event: { seq: number; id: string; type: string; payload: unknown; createdAt: string }) => void;

const subscribers = new Map<string, Set<Subscriber>>();

export function subscribeToStream(orgId: string, fn: Subscriber): () => void {
  if (!subscribers.has(orgId)) subscribers.set(orgId, new Set());
  subscribers.get(orgId)!.add(fn);
  return () => subscribers.get(orgId)?.delete(fn);
}

export function publishToStream(orgId: string, evt: StreamEvent, meta?: { seq: number; id: string; createdAt: string }) {
  const subs = subscribers.get(orgId);
  if (!subs || subs.size === 0) return;
  const enriched = {
    seq: meta?.seq ?? 0,
    id: meta?.id ?? "",
    type: evt.type,
    payload: evt.payload,
    createdAt: meta?.createdAt ?? new Date().toISOString(),
  };
  for (const fn of subs) fn(enriched);
}

/** Durably records an event and fans it out to live subscribers + webhook subscriptions. */
export async function emitEvent(orgId: string, type: string, payload: unknown, correlationId: string) {
  const [row] = await db
    .insert(events)
    .values({ orgId, type, payload: payload as object, correlationId })
    .returning();

  publishToStream(orgId, { type, payload }, {
    seq: row.seq,
    id: row.id,
    createdAt: row.createdAt.toISOString(),
  });

  // Fan out to webhook subscriptions (deferred import avoids a cycle at module init).
  const { enqueueDeliveriesForEvent } = await import("./webhooks");
  await enqueueDeliveriesForEvent(orgId, type, row.id, { id: row.id, type, payload, createdAt: row.createdAt });

  return row;
}

export async function replayEventsSince(orgId: string, cursorSeq: number, limit = 200) {
  const where =
    cursorSeq > 0 ? and(eq(events.orgId, orgId), gt(events.seq, cursorSeq)) : eq(events.orgId, orgId);
  return db.select().from(events).where(where).orderBy(asc(events.seq)).limit(limit);
}
