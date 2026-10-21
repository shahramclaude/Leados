// Part 01 seam, reused: durable outbox-backed event store.
//
// Every realtime fact is written here FIRST (durable, monotonically
// increasing `id`), then fanned out to live subscribers via eventBus. This
// ordering is what makes Last-Event-ID resume lossless: a reconnecting
// client replays everything with id > lastSeenId directly from this table,
// so it is impossible to miss an event that was written before the
// subscription existed, and impossible to see one twice (strictly > compare).

import { db } from "@/db";
import { eventOutbox } from "@/db/schema";
import { and, asc, gt, sql } from "drizzle-orm";
import { publish } from "@/lib/eventBus";

export type StreamEventType =
  | "finding"
  | "approval"
  | "work_queue"
  | "metric_anomaly"
  | "agent_run"
  | "notification"
  | "presence"
  | "comment";

export interface StreamFrame {
  id: number;
  type: StreamEventType;
  domain: string;
  entityRef: string | null;
  payload: unknown;
  visibleRoles: string[];
  createdAt: string;
}

export async function appendEvent(input: {
  type: StreamEventType;
  domain: string;
  entityRef?: string | null;
  payload: unknown;
  visibleRoles: string[];
}): Promise<StreamFrame> {
  const [row] = await db
    .insert(eventOutbox)
    .values({
      type: input.type,
      domain: input.domain,
      entityRef: input.entityRef ?? null,
      payload: input.payload as object,
      visibleRoles: input.visibleRoles,
    })
    .returning();

  const frame: StreamFrame = {
    id: row.id,
    type: row.type as StreamEventType,
    domain: row.domain,
    entityRef: row.entityRef,
    payload: row.payload,
    visibleRoles: row.visibleRoles,
    createdAt: row.createdAt.toISOString(),
  };

  // Fan out to any live in-process subscribers (realtime path). The outbox
  // row above is the durable source of truth used for resume/backfill.
  publish(frame);
  return frame;
}

export async function readEventsSince(
  lastEventId: number,
  opts: { roles: string[]; limit?: number },
): Promise<StreamFrame[]> {
  const limit = opts.limit ?? 500;
  const rows = await db
    .select()
    .from(eventOutbox)
    .where(gt(eventOutbox.id, lastEventId))
    .orderBy(asc(eventOutbox.id))
    .limit(limit);

  return rows
    .filter((r) => roleSetCanSee(opts.roles, r.visibleRoles))
    .map((r) => ({
      id: r.id,
      type: r.type as StreamEventType,
      domain: r.domain,
      entityRef: r.entityRef,
      payload: r.payload,
      visibleRoles: r.visibleRoles,
      createdAt: r.createdAt.toISOString(),
    }));
}

export function roleSetCanSee(roles: string[], visibleRoles: string[]): boolean {
  if (visibleRoles.includes("*")) return true;
  return roles.some((r) => visibleRoles.includes(r));
}

export async function latestEventId(): Promise<number> {
  const [row] = await db
    .select({ maxId: sql<number>`coalesce(max(${eventOutbox.id}), 0)` })
    .from(eventOutbox);
  return row?.maxId ?? 0;
}

// Used by the "what changed since last visit" delta on the Now surface.
export async function countEventsSince(lastEventId: number, roles: string[], domain?: string) {
  const rows = await db
    .select()
    .from(eventOutbox)
    .where(
      domain
        ? and(gt(eventOutbox.id, lastEventId), sql`${eventOutbox.domain} = ${domain}`)
        : gt(eventOutbox.id, lastEventId),
    )
    .orderBy(asc(eventOutbox.id));
  return rows.filter((r) => roleSetCanSee(roles, r.visibleRoles));
}
