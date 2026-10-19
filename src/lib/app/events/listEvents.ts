/**
 * src/lib/app/events/listEvents.ts
 *
 * Use-case layer: read path for the event log, used by the events API
 * route and the home page system-status panel.
 */
import type { EventRecord } from "@/lib/domain/types";
import { listEvents as listEventsFromRepository, countEvents } from "@/lib/platform/db/eventsRepository";

export interface EventsOverview {
  total: number;
  recent: EventRecord[];
}

export async function getEventsOverview(limit = 20): Promise<EventsOverview> {
  const [recent, total] = await Promise.all([listEventsFromRepository(limit), countEvents()]);
  return { total, recent };
}
