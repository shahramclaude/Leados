// Repository layer: the ONLY module (besides other repositories) allowed
// to import the Drizzle `db` client and the `event_log` table.
//
// This is the append-only event store referenced by
// docs/adr/0005-event-versioning-posture.md. Every state-changing use case
// in `src/lib/app` should call `eventRepository.append()` after its primary
// write so later parts of the program can build read models, audit trails,
// and the autonomous agent loop from a reliable history instead of
// reverse-engineering intent from table state.
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { eventLog } from "@/db/schema";

export interface AppendEventInput {
  id: string;
  eventType: string;
  eventVersion?: number;
  payload: Record<string, unknown>;
  actor?: string;
}

export interface EventRecord {
  id: string;
  eventType: string;
  eventVersion: string;
  payload: unknown;
  actor: string | null;
  createdAt: Date;
}

export const eventRepository = {
  async append(input: AppendEventInput): Promise<EventRecord> {
    const [row] = await db
      .insert(eventLog)
      .values({
        id: input.id,
        eventType: input.eventType,
        eventVersion: String(input.eventVersion ?? 1),
        payload: input.payload,
        actor: input.actor,
      })
      .returning();
    return row;
  },

  async recent(limit = 20): Promise<EventRecord[]> {
    return db.select().from(eventLog).orderBy(desc(eventLog.createdAt)).limit(limit);
  },

  async count(): Promise<number> {
    const rows = await db.select().from(eventLog);
    return rows.length;
  },
};
