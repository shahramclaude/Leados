// src/lib/events/eventLogDb.ts
//
// Postgres-backed `EventLog` implementation (Part 01 proxy), append-only
// against the `people_events` table. Only imported by Next.js API routes —
// never by the pure test suites, which use `createInMemoryEventLog` from
// `eventLog.ts` instead so they don't need a database connection.

import { db } from "@/db";
import { peopleEvents } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { EventLog } from "./eventLog";

export function createDbEventLog(): EventLog {
  return {
    async append(event) {
      const [row] = await db
        .insert(peopleEvents)
        .values({
          id: randomUUID(),
          type: event.type,
          subjectId: event.subjectId,
          actorId: event.actorId,
          purpose: event.purpose,
          payload: event.payload,
        })
        .returning();
      return { ...row, payload: row.payload as Record<string, unknown>, createdAt: row.createdAt.toISOString() };
    },
    async query(filter) {
      const conditions = [];
      if (filter.subjectId) conditions.push(eq(peopleEvents.subjectId, filter.subjectId));
      if (filter.type) conditions.push(eq(peopleEvents.type, filter.type));
      const rows = await db
        .select()
        .from(peopleEvents)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(peopleEvents.createdAt));
      return rows.map((r) => ({ ...r, payload: r.payload as Record<string, unknown>, createdAt: r.createdAt.toISOString() }));
    },
  };
}
