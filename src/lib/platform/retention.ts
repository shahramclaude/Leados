// LEADOS Part 01 — retention policy reporting + person-level erasure.
//
// IMPORTANT, READ BEFORE EXTENDING: this store is append-only by design (the
// `events` table trigger forbids UPDATE/DELETE). That means "erasure" here
// can NEVER mean "overwrite the old bytes" — it means:
//   1. Append a `privacy.person_erased` event (itself an audited fact — it
//      has an actor, an occurredAt, and shows up in every export).
//   2. Every projector listed as a consumer of that event type in
//      eventCatalog.ts (currently peopleRoster, peopleFlightRisk) applies it
//      and stops surfacing the identifying fields from that point forward,
//      in every live read (dashboards, /api, future UI).
//   3. The ORIGINAL raw event payloads (e.g. the `name` in the original
//      people.person_added event) remain physically present in the log.
//      This is a deliberate, documented trade-off — see
//      "What we did NOT do" in AI-SESSION-LOG.md Part 01. A full solution
//      needs field-level crypto-shredding (encrypt PII at write time with a
//      per-person key; delete the key to make old payloads permanently
//      unreadable without mutating any row) or moving PII out of event
//      payloads into a separate, genuinely-mutable "PII vault" keyed by
//      personId. Neither is implemented in Part 01.
// `retentionDays` per event type (see eventCatalog.ts) is therefore
// ADVISORY: `findRedactionCandidates` reports events that are old enough and
// PII-bearing enough to warrant a human/compliance decision; it does not
// delete or rewrite anything.

import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { appendEvent } from "@/lib/eventStore";
import { EVENT_CATALOG, type EventTypeId } from "@/lib/events/eventCatalog";
import { newUlid } from "@/lib/ulid";

export type RedactionCandidate = {
  eventId: string;
  type: string;
  entityId: string;
  occurredAt: string;
  ageDays: number;
  retentionDays: number;
};

/** Advisory report only — see module header. */
export async function findRedactionCandidates(orgId: string): Promise<RedactionCandidate[]> {
  const piiTypes = (Object.keys(EVENT_CATALOG) as EventTypeId[]).filter((t) => EVENT_CATALOG[t].retention.containsPii);
  const out: RedactionCandidate[] = [];
  for (const type of piiTypes) {
    const retentionDays = EVENT_CATALOG[type].retention.redactAfterDays;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.orgId, orgId), eq(events.type, type), lt(events.occurredAt, cutoff)));
    for (const row of rows) {
      out.push({
        eventId: row.eventId,
        type: row.type,
        entityId: row.entityId,
        occurredAt: row.occurredAt.toISOString(),
        ageDays: Math.floor((Date.now() - row.occurredAt.getTime()) / 86_400_000),
        retentionDays,
      });
    }
  }
  return out;
}

export type EraseParams = {
  orgId: string;
  personId: string;
  requestedBy: string;
  correlationId?: string;
};

/** Carry out a person-level erasure request: append the tombstone event. The
 * event store's synchronous projector application immediately scrubs
 * peopleRoster/peopleFlightRisk for this person in the same transaction. */
export async function erasePerson(params: EraseParams) {
  return appendEvent({
    type: "privacy.person_erased",
    orgId: params.orgId,
    actor: { kind: "user", id: params.requestedBy },
    entityId: params.personId,
    correlationId: params.correlationId ?? newUlid(),
    source: "api",
    payload: {
      personId: params.personId,
      requestedBy: params.requestedBy,
      method: "tombstone-scrub" as const,
    },
  });
}
