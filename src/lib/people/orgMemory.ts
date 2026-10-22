// src/lib/people/orgMemory.ts
//
// Append-only history on top of the event log: every time a people-facing
// surface computes something (a skills-matrix render, a team-composer
// proposal, a compensation-band aggregate), it can write a snapshot event
// here. This gives staleness context ("this matrix cell reflects evidence as
// of...") and an audit trail for "what did the org see, and when" — including
// after a contestation changes the inputs.

import type { EventLog, PeopleEvent } from "../events/eventLog";

export const ORG_MEMORY_EVENT_TYPES = {
  SKILLS_MATRIX_RENDERED: "people.org_memory.skills_matrix_rendered",
  TEAM_COMPOSITION_PROPOSED: "people.org_memory.team_composition_proposed",
  COMPENSATION_AGGREGATE_RENDERED: "people.org_memory.compensation_aggregate_rendered",
} as const;

export async function recordSnapshot(log: EventLog, params: { type: string; subjectId: string; actorId: string; purpose: string; payload: Record<string, unknown> }): Promise<PeopleEvent> {
  return log.append(params);
}

export async function history(log: EventLog, subjectId: string): Promise<PeopleEvent[]> {
  return log.query({ subjectId });
}

/** Human-readable "what changed and when" narrative built from the raw event history — used by Succession/Skills surfaces. */
export function summarizeHistory(events: PeopleEvent[]): string {
  if (events.length === 0) return "No recorded history yet.";
  const latest = events[events.length - 1];
  return `${events.length} recorded event(s); most recent: ${latest.type} at ${latest.createdAt}.`;
}
