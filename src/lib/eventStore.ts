import { db } from "@/db";
import { events } from "@/db/schema";
import { asc } from "drizzle-orm";
import type { Domain, LeadosEvent, NewLeadosEvent } from "@/lib/types";

function rowToEvent(row: typeof events.$inferSelect): LeadosEvent {
  return {
    id: row.id,
    type: row.type,
    domain: row.domain as Domain,
    entityId: row.entityId,
    ts: (row.ts instanceof Date ? row.ts : new Date(row.ts)).toISOString(),
    data: (row.data ?? {}) as Record<string, unknown>,
    source: row.source,
  };
}

// APPEND ONLY — there is no update/delete path. This is the single write
// primitive for the whole system (self-test T02_APPEND_ONLY asserts this).
export async function appendEvent(e: NewLeadosEvent): Promise<LeadosEvent> {
  const [row] = await db
    .insert(events)
    .values({
      type: e.type,
      domain: e.domain,
      entityId: e.entityId ?? null,
      ts: new Date(e.ts),
      data: e.data as Record<string, unknown>,
      source: e.source ?? "system",
    })
    .returning();
  return rowToEvent(row);
}

export async function appendEvents(es: NewLeadosEvent[]): Promise<LeadosEvent[]> {
  if (es.length === 0) return [];
  const rows = await db
    .insert(events)
    .values(
      es.map((e) => ({
        type: e.type,
        domain: e.domain,
        entityId: e.entityId ?? null,
        ts: new Date(e.ts),
        data: e.data as Record<string, unknown>,
        source: e.source ?? "system",
      }))
    )
    .returning();
  return rows.map(rowToEvent);
}

export async function listEvents(): Promise<LeadosEvent[]> {
  const rows = await db.select().from(events).orderBy(asc(events.ts), asc(events.id));
  return rows.map(rowToEvent);
}

export async function countEvents(): Promise<number> {
  const rows = await db.select().from(events);
  return rows.length;
}
