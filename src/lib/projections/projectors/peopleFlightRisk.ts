// Projector: peopleFlightRisk — current flight-risk assessment per person.
// Consumes: people.flight_risk_changed, privacy.person_erased.
// Entity key: personId. Feeds the cockpit hot query (hotQueries.ts).
import type { Projector } from "../engine";

export type PeopleFlightRiskState = {
  personId: string;
  riskLevel: "low" | "medium" | "high" | null;
  score: number | null;
  reason: string | null;
  historyCount: number;
  erased: boolean;
};

const initial: PeopleFlightRiskState = {
  personId: "",
  riskLevel: null,
  score: null,
  reason: null,
  historyCount: 0,
  erased: false,
};

export const peopleFlightRiskProjector: Projector<PeopleFlightRiskState> = {
  name: "peopleFlightRisk",
  interestedIn: ["people.flight_risk_changed", "privacy.person_erased"],
  initial,
  apply(state, e) {
    switch (e.type) {
      case "people.flight_risk_changed": {
        // payload is always upcast to v2 shape by the time a projector sees
        // it (riskLevel, reason, score, previousLevel).
        const p = e.payload as { personId: string; riskLevel: "low" | "medium" | "high"; reason: string; score: number };
        return {
          ...state,
          personId: p.personId,
          riskLevel: p.riskLevel,
          score: p.score,
          reason: p.reason,
          historyCount: state.historyCount + 1,
        };
      }
      case "privacy.person_erased": {
        // Keep riskLevel/score (needed for lawful attrition-risk aggregates);
        // scrub the free-text reason, which is the identifying/sensitive part.
        return { ...state, reason: "[erased]", erased: true };
      }
      default:
        return state;
    }
  },
};
