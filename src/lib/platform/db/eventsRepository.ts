/**
 * src/lib/platform/db/eventsRepository.ts
 *
 * The only file in the codebase that is allowed to import `events` from
 * `src/db/schema.ts` and run Drizzle queries against it. Everything above
 * this layer (use-cases in `src/lib/app`, routes in `src/app`) talks to
 * the database exclusively through the functions exported here.
 *
 * This is the "repository layer in src/lib/platform" required by Part 0,
 * item 3. It wraps the existing Drizzle client (`src/db/index.ts`) rather
 * than replacing it.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import type { EventRecord, NewEventInput } from "@/lib/domain/types";

export async function insertEvent(input: NewEventInput): Promise<EventRecord> {
  const [row] = await db
    .insert(events)
    .values({
      type: input.type,
      version: input.version,
      payload: input.payload,
    })
    .returning();

  return row;
}

export async function listEvents(limit = 50): Promise<EventRecord[]> {
  return db.select().from(events).orderBy(desc(events.createdAt)).limit(limit);
}

export async function getEventById(id: number): Promise<EventRecord | undefined> {
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return row;
}

export async function countEvents(): Promise<number> {
  const rows = await db.select().from(events);
  return rows.length;
}
