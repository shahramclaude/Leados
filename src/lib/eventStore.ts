// LEADOS Part 01 — the event store. THIS IS THE SINGLE WRITE PATH.
//
// Every fact that enters the system — from UI actions, automations, imports,
// or migrations — must go through `appendEvent()` here. Nothing else may
// `db.insert(events)`. This function:
//   1. Validates the payload against the CURRENT schema for the type
//      (src/lib/events/eventSchema.ts) — bad payloads never reach storage.
//   2. Mints a monotonic ULID eventId and stamps recordedAt = now().
//   3. Inserts the event row, and — if the catalog marks the type
//      `notify: true` — an outbox row, in the SAME transaction.
//   4. Synchronously folds the event into every interested hot projector
//      (src/lib/projections/engine.ts), in the SAME transaction, so a
//      dashboard read immediately after a successful write always reflects
//      it (read-your-writes), without a second round trip.
//   5. After the transaction commits, publishes the envelope on the
//      in-process eventBus for any best-effort, non-transactional listeners
//      (e.g. a future dev-mode activity console). This step is NOT relied on
//      for correctness — rebuildProjections() is the source of truth if it's
//      ever missed (process crash between commit and publish, etc).
import { db } from "@/db";
import { insertEvent, type AppendResult } from "@/lib/platform/eventRepository";
import { applyEnvelopeSync } from "@/lib/projections/engine";
import { ensureProjectorsRegistered } from "@/lib/projections/registerAll";
import { eventBus } from "@/lib/eventBus";
import type { NewEventInput } from "@/lib/events/types";
import type { EventTypeId } from "@/lib/events/eventCatalog";

export type AppendEventInput = NewEventInput & { type: EventTypeId };

export async function appendEvent(input: AppendEventInput): Promise<AppendResult> {
  ensureProjectorsRegistered();

  const result = await db.transaction(async (tx) => {
    const appendResult = await insertEvent(tx, input);
    if (!appendResult.deduped) {
      await applyEnvelopeSync(tx, appendResult.envelope);
    }
    return appendResult;
  });

  // Best-effort, outside the transaction, never blocks/affects correctness.
  await eventBus.publish(result.envelope);

  return result;
}

export { getEventStream, replayEvents, exportAllRawRows, countEvents } from "@/lib/platform/eventRepository";
export { rebuildProjections, currentProjectionHash } from "@/lib/projections/engine";
