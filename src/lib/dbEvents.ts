// src/lib/dbEvents.ts
//
// Minimal domain-event outbox. Every meaningful platform action (sync
// completed, import committed, dedup decided, entity merged/unmerged, export
// generated) is written to `platform_events` for audit/debugging, and also
// re-emitted in-process for same-request subscribers (e.g. UI polling).
//
// DOCUMENTED LIMIT: this is NOT a durable cross-process queue/broker. If the
// app restarts between emit and a slow consumer, only the DB row survives —
// there is no retry/redelivery. A future part should swap this for a real
// broker (Kafka/SQS/etc.) behind the same `emitEvent` signature.
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { db } from "@/db";
import { platformEvents } from "@/db/schema";

export type PlatformEventType =
  | "connector.sync_started"
  | "connector.sync_finished"
  | "connector.health_changed"
  | "import.previewed"
  | "import.committed"
  | "dedup.candidate_created"
  | "dedup.confirmed"
  | "dedup.rejected"
  | "dedup.unmerged"
  | "export.generated"
  | "export.verified";

export const platformEventBus = new EventEmitter();

export async function emitEvent(eventType: PlatformEventType, payload: Record<string, unknown>): Promise<void> {
  const id = randomUUID();
  await db.insert(platformEvents).values({ id, eventType, payload });
  platformEventBus.emit(eventType, payload);
  platformEventBus.emit("*", { eventType, payload });
}
