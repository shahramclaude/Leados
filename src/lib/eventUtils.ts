// src/lib/eventUtils.ts
//
// BOOTSTRAP NOTE: shared event-filtering helpers used by signalFusion.ts,
// bayesianNetwork.ts/beliefFabric.ts and causalChain.ts. Extracted here to
// avoid duplicating the same window/type filters across files (no parallel
// implementations). Original derivation, no external source.

import type { LeadosEvent } from "./types";
import { isWithinDays } from "./temporal";

export function eventsOfType(events: LeadosEvent[], type: string): LeadosEvent[] {
  return events.filter((e) => e.type === type);
}

export function eventsInWindow(events: LeadosEvent[], now: Date, days: number): LeadosEvent[] {
  return events.filter((e) => isWithinDays(e.occurredAt, now, days));
}

export function eventsOfTypeInWindow(
  events: LeadosEvent[],
  type: string,
  now: Date,
  days: number,
): LeadosEvent[] {
  return eventsInWindow(eventsOfType(events, type), now, days);
}

export function countOfTypeInWindow(
  events: LeadosEvent[],
  type: string,
  now: Date,
  days: number,
): number {
  return eventsOfTypeInWindow(events, type, now, days).length;
}
