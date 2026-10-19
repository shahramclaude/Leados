// src/lib/people/erasure.ts
//
// GDPR Article 17 ("right to erasure") for a person, implemented in a way
// that is lawful AND keeps org-level aggregate statistics correct — see
// docs/DATA.md §7 for the full write-up. Summary of the approach:
//
//   1. The event log is append-only and is never deleted wholesale (that
//      would destroy audit trails other laws require us to keep, e.g.
//      financial/decision records that happen to reference a person).
//      Instead, every event belonging to the erased person that carries a
//      PII field (per `eventCatalog.piiFields`) is REDACTED in place via
//      the one narrow, trigger-guarded UPDATE path
//      (eventStore.redactEventPayload) — PII fields are replaced with a
//      tombstone, all non-identifying fields (sentiment, engagement,
//      flightRisk, counts, durations, ...) are left untouched so rollups
//      computed over the log before/after erasure are unaffected.
//   2. The live projection row (`people_projection`) is updated directly
//      (projections are disposable/derived, so mutating them outside the
//      normal event-driven path is fine) to show the redacted name
//      immediately, without needing a full rebuild.
//   3. The erasure itself is written to `audit_log` (never to the business
//      event log, so the fact "person X was erased" can't itself leak
//      back into intelligence derived from the event log).
//
// After erasure, `rebuildProjections()` still reproduces the redacted
// state exactly, because projectors fold whatever is currently stored in
// `events.data` — which is now the tombstoned payload.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { events, peopleProjection } from "@/db/schema";
import { redactEventPayload } from "@/lib/events/eventStore";
import { getCatalogEntry } from "@/lib/events/eventCatalog";
import { recordAudit } from "@/lib/repositories/auditRepository";

const REDACTED_MARKER = "[erased]";

function redactFields(data: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const next = { ...data };
  for (const field of fields) {
    if (field in next) next[field] = REDACTED_MARKER;
  }
  return next;
}

export interface ErasureReport {
  personId: string;
  eventsRedacted: number;
  erasedAt: string;
}

export async function erasePerson(personId: string, actorId = "system"): Promise<ErasureReport> {
  const rows = await db.select().from(events).where(eq(events.entityId, personId));

  let redactedCount = 0;
  for (const row of rows) {
    if (row.redacted) continue;
    const catalogEntry = getCatalogEntry(row.type);
    if (catalogEntry.piiFields.length === 0) continue;
    const result = await redactEventPayload(row.id, (data) => redactFields(data, catalogEntry.piiFields));
    if (result) redactedCount += 1;
  }

  const erasedAt = new Date();
  await db
    .update(peopleProjection)
    .set({ name: "Erased Member", email: null, erasedAt, updatedAt: erasedAt })
    .where(eq(peopleProjection.id, personId));

  await recordAudit(
    "erasure",
    { personId, eventsRedacted: redactedCount },
    { actorId, targetId: personId },
  );

  return { personId, eventsRedacted: redactedCount, erasedAt: erasedAt.toISOString() };
}
