/**
 * src/lib/app/events/recordEvent.ts
 *
 * Use-case layer: orchestrates domain validation (pure, server-agnostic)
 * and platform persistence (Postgres via the repository layer). Routes in
 * `src/app` should call this instead of touching the repository or the
 * schema registry directly.
 */
import { validateEventPayload } from "@/lib/domain/eventSchema";
import type { EventRecord } from "@/lib/domain/types";
import { insertEvent } from "@/lib/platform/db/eventsRepository";

export interface RecordEventInput {
  type: string;
  version: number;
  payload: unknown;
}

export async function recordEvent(input: RecordEventInput): Promise<EventRecord> {
  const validatedPayload = validateEventPayload(input.type, input.version, input.payload);

  return insertEvent({
    type: input.type,
    version: input.version,
    payload: validatedPayload,
  });
}
