// src/lib/events/id.ts
//
// Deterministic, time-sortable, globally unique event identifiers.
//
// We use ULID (https://github.com/ulid/spec) instead of relying on the
// Postgres serial `seq` column for causality/ordering reasoning: a ULID
// embeds a millisecond timestamp in its first 48 bits and is lexically
// sortable, so `causationId`/`correlationId` chains and cross-system
// event ids (e.g. imported from another LEADOS instance) remain orderable
// and comparable without ever touching the database. `seq` still exists
// purely as a cheap keyset-pagination cursor (see eventsRepository.ts).

import { monotonicFactory } from "ulid";

const ulid = monotonicFactory();

export function newEventId(): string {
  return ulid();
}

export function isValidUlid(value: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}
