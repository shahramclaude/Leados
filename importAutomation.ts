// Event Import Automation — pt-D brief §"Event Import Automation".
// Demo-only: simulates "before/after an import.mergeInto()" since no real
// import pipeline exists in this standalone demo (the real store.js was
// read, but its import/merge internals were out of this session's scope —
// see AI-SESSION-LOG.md §2 "not verified this session").

import type { LeadEvent, Store } from "./types";
import { collectCadenceFindings } from "./schedule";

export interface ImportResult {
  importedPeopleIds: string[];
  importedEvents: LeadEvent[];
  unknownTypes: string[];
}

export interface ImportSuggestionReport {
  newPeople: { id: string; name: string }[];
  newEventTypes: string[];
  findingsBefore: number;
  findingsAfter: number;
  newFindingKeys: string[];
}

const KNOWN_TYPES = new Set([
  "oneonone.logged",
  "pulse.recorded",
  "sl.assessment",
  "feedback.given",
  "commitment.made",
  "goal.progress",
  "sprint.review",
  "sprint.retro.action",
  "sprint.started",
  "crisis.detected",
  "war.room.opened",
  "incident.comms.sent",
  "hr.attrition.logged",
  "key.dependency.logged",
  "succession.candidate",
  "plan.created",
  "narrative.drafted",
  "message.tested",
  "exec.kpi.reviewed",
  "exec.board.meeting",
  "strategy.okr.set",
  "fin.unit.logged",
  "fin.forecast.logged",
  "note.added",
  "settings.changed",
]);

export function importSuggestions(before: Store, after: Store, today: number): ImportSuggestionReport {
  const beforeFindings = collectCadenceFindings(before, today);
  const afterFindings = collectCadenceFindings(after, today);
  const beforeKeys = new Set(beforeFindings.map((f) => f.key));
  const newFindingKeys = afterFindings.filter((f) => !beforeKeys.has(f.key)).map((f) => f.key);

  const beforePeopleIds = new Set(before.people.map((p) => p.id));
  const newPeople = after.people.filter((p) => !beforePeopleIds.has(p.id)).map((p) => ({ id: p.id, name: p.name }));

  const newEventTypes = Array.from(new Set(after.events.map((e) => e.type))).filter((t) => !KNOWN_TYPES.has(t));

  return {
    newPeople,
    newEventTypes,
    findingsBefore: beforeFindings.length,
    findingsAfter: afterFindings.length,
    newFindingKeys,
  };
}
