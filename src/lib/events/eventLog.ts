// src/lib/events/eventLog.ts
//
// PART 01 PROXY: this repository snapshot does not yet contain Part 01's
// org-wide append-only event log. This module defines the minimal contract
// Part 09 needs (`append`, `query`) so that the real Part 01 log can be
// swapped in later without touching any caller — `contestation.ts` and
// `orgMemory.ts` only ever depend on the `EventLog` interface below, never
// on a concrete implementation.
//
// This file intentionally has NO database dependency, so every pure/unit
// test in this part (`npm run test:*`) can run without a Postgres
// connection. The Postgres-backed implementation lives in
// `eventLogDb.ts` (which the Next.js API routes import) specifically so
// that importing it never pulls in `@/db` here.

import { randomUUID } from "crypto";

export interface PeopleEvent {
  id: string;
  type: string;
  subjectId: string;
  actorId: string;
  purpose: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface EventLog {
  append(event: Omit<PeopleEvent, "id" | "createdAt">): Promise<PeopleEvent>;
  query(filter: { subjectId?: string; type?: string }): Promise<PeopleEvent[]>;
}

export function createInMemoryEventLog(seed: PeopleEvent[] = []): EventLog {
  const rows: PeopleEvent[] = [...seed];
  return {
    async append(event) {
      const row: PeopleEvent = { ...event, id: randomUUID(), createdAt: new Date().toISOString() };
      rows.push(row);
      return row;
    },
    async query(filter) {
      return rows
        .filter((r) => (filter.subjectId ? r.subjectId === filter.subjectId : true))
        .filter((r) => (filter.type ? r.type === filter.type : true))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  };
}
