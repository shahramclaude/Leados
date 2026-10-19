/**
 * src/lib/store.ts — append-only event log, Postgres-backed.
 *
 * AUDIT NOTE: the real repo's root `store.ts` is a localStorage-only
 * implementation (`STORAGE_KEY = "leados-orgphysics-sandbox:data"`),
 * which is exactly the "no persistence beyond localStorage" gap this
 * Part 1 brief calls out as a problem to fix. This module keeps the same
 * public shape (`load`, `append`, `appendAt`, `reset`, `hasData`) but
 * backs it with the `events` table in Postgres via Drizzle, so the same
 * log is readable from both the browser and every Next.js API route.
 */

import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import type { LeadosEvent } from "./types";

function rowToEvent(row: typeof eventsTable.$inferSelect): LeadosEvent {
  return {
    id: row.eventId,
    ts: row.ts.toISOString(),
    type: row.type,
    data: row.data,
    meta: row.seeded ? { seeded: true } : undefined,
  };
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return "e-" + Date.now().toString(36) + "-" + String(seq).padStart(4, "0");
}

export async function load(): Promise<LeadosEvent[]> {
  const rows = await db.select().from(eventsTable).orderBy(asc(eventsTable.ts));
  return rows.map(rowToEvent);
}

export async function append(type: string, data: Record<string, any>): Promise<LeadosEvent> {
  const id = nextId();
  const ts = new Date();
  await db.insert(eventsTable).values({ eventId: id, ts, type, data, seeded: false });
  return { id, ts: ts.toISOString(), type, data };
}

/** Seed-only backdating path. Every event produced here is marked seeded=true. */
export async function appendAt(type: string, data: Record<string, any>, ts: string): Promise<LeadosEvent> {
  const id = nextId();
  await db.insert(eventsTable).values({ eventId: id, ts: new Date(ts), type, data, seeded: true });
  return { id, ts, type, data, meta: { seeded: true } };
}

export async function reset(): Promise<void> {
  await db.execute(sql`delete from ${eventsTable}`);
}

export async function hasData(): Promise<boolean> {
  const rows = await db.select({ id: eventsTable.id }).from(eventsTable).limit(1);
  return rows.length > 0;
}

export async function count(): Promise<number> {
  const result = await db.select({ c: sql<number>`count(*)::int` }).from(eventsTable);
  return result[0]?.c ?? 0;
}
