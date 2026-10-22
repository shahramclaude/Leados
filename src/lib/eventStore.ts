// LEADOS Part 14 — outbox-backed event store.
// Durability-first: every realtime frame is written to Postgres BEFORE it is
// fanned out to live connections. This is what makes `Last-Event-ID` resume
// lossless — a reconnecting client always replays from the durable log, not
// from in-memory state that could have been dropped.
import { db } from "@/db";
import { eventOutbox } from "@/db/schema";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";

export type FrameType =
  | "finding"
  | "approval"
  | "work_queue"
  | "anomaly"
  | "run_progress"
  | "notification_state"
  | "lag_notice"
  | "heartbeat";

export interface AppendEventInput {
  orgId: string;
  topic: string;
  type: FrameType;
  payload: Record<string, unknown>;
  dedupeKey?: string;
}

export interface StoredFrame {
  id: string; // bigint serialized as string to avoid precision loss over JSON
  orgId: string;
  topic: string;
  type: FrameType;
  payload: Record<string, unknown>;
  dedupeKey: string | null;
  createdAt: string;
}

function rowToFrame(row: typeof eventOutbox.$inferSelect): StoredFrame {
  return {
    id: row.id.toString(),
    orgId: row.orgId,
    topic: row.topic,
    type: row.type as FrameType,
    payload: row.payload as Record<string, unknown>,
    dedupeKey: row.dedupeKey,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Append a frame to the durable outbox. Returns the stored frame (with its monotonic id). */
export async function appendEvent(input: AppendEventInput): Promise<StoredFrame> {
  const [row] = await db
    .insert(eventOutbox)
    .values({
      orgId: input.orgId,
      topic: input.topic,
      type: input.type,
      payload: input.payload,
      dedupeKey: input.dedupeKey ?? null,
    })
    .returning();
  return rowToFrame(row);
}

/**
 * Fetch frames after `lastId` (exclusive) for any of `topics`, in strictly
 * increasing id order. This is the resume path used both for
 * `Last-Event-ID` reconnects and for the initial catch-up on first connect.
 */
export async function getFramesSince(
  topics: string[],
  lastId: bigint | null,
  limit = 500,
): Promise<StoredFrame[]> {
  if (topics.length === 0) return [];
  const conditions = [inArray(eventOutbox.topic, topics)];
  if (lastId !== null) conditions.push(gt(eventOutbox.id, lastId));
  const rows = await db
    .select()
    .from(eventOutbox)
    .where(and(...conditions))
    .orderBy(asc(eventOutbox.id))
    .limit(limit);
  return rows.map(rowToFrame);
}

export async function getLatestFrameId(): Promise<bigint | null> {
  const result = await db.execute<{ max: string | null }>(sql`SELECT MAX(id)::text AS max FROM event_outbox`);
  const max = result.rows[0]?.max;
  return max ? BigInt(max) : null;
}

/** Build the set of topics a given role/user can see. Shared contract for Parts 15/19 to reuse. */
export function scopedTopics(orgId: string, userId: string, role: string): string[] {
  return [`org:${orgId}:broadcast`, `org:${orgId}:role:${role}`, `org:${orgId}:user:${userId}`];
}
