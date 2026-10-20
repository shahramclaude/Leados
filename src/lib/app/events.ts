import type { EventRecord, Page } from "@/lib/domain/types";
import { validateEventPayload } from "@/lib/domain/eventSchema";
import { insertEvent, listEventsPage } from "@/lib/platform/db/eventsRepository";

export interface RecordEventInput {
  type: string;
  version: number;
  payload: unknown;
}

/** Validates the payload against the event catalog/schema before persisting. */
export async function recordEvent(input: RecordEventInput): Promise<EventRecord> {
  const validated = validateEventPayload(input.type, input.version, input.payload);
  return insertEvent({ type: input.type, version: input.version, payload: validated });
}

export async function listEvents(searchParams: URLSearchParams): Promise<Page<EventRecord>> {
  return listEventsPage(searchParams);
}
