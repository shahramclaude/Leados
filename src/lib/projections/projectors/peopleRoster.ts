// Projector: peopleRoster — current roster entry per person.
// Consumes: people.person_added, people.role_changed, privacy.person_erased.
// Entity key: personId.
import type { Projector } from "../engine";

export type PeopleRosterState = {
  personId: string;
  name: string;
  role: string;
  team: string;
  startDate: string | null;
  erased: boolean;
  erasedAt: string | null;
};

const initial: PeopleRosterState = {
  personId: "",
  name: "",
  role: "",
  team: "",
  startDate: null,
  erased: false,
  erasedAt: null,
};

export const peopleRosterProjector: Projector<PeopleRosterState> = {
  name: "peopleRoster",
  interestedIn: ["people.person_added", "people.role_changed", "privacy.person_erased"],
  initial,
  apply(state, e) {
    switch (e.type) {
      case "people.person_added": {
        const p = e.payload as { personId: string; name: string; role: string; team: string; startDate: string };
        return { ...state, personId: p.personId, name: p.name, role: p.role, team: p.team, startDate: p.startDate };
      }
      case "people.role_changed": {
        const p = e.payload as { toRole: string };
        return { ...state, role: p.toRole };
      }
      case "privacy.person_erased": {
        // Tombstone scrub: remove the identifying name, KEEP role/team/startDate
        // because headcount-by-team and tenure aggregates remain lawful to
        // report even after a person asks to be forgotten. See docs/DATA.md
        // "Retention & erasure" section for the full rationale.
        return { ...state, name: "[erased]", erased: true, erasedAt: e.occurredAt };
      }
      default:
        return state;
    }
  },
};
