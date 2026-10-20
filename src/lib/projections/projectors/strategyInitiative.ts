// Projector: strategyInitiative — one row per initiative, including nested
// OKR progress.
// Consumes: strategy.initiative_created, strategy.initiative_status_changed,
//           strategy.okr_progress_recorded.
// Entity key: initiativeId (okr_progress_recorded carries okrId in its
// payload but belongs to the initiative aggregate — see eventCatalog.ts).
import type { Projector } from "../engine";

export type StrategyInitiativeState = {
  initiativeId: string;
  title: string;
  owner: string;
  quarter: string;
  status: "on_track" | "at_risk" | "off_track" | null;
  lastNote: string | null;
  okrs: Record<string, { progressPct: number }>;
};

const initial: StrategyInitiativeState = {
  initiativeId: "",
  title: "",
  owner: "",
  quarter: "",
  status: null,
  lastNote: null,
  okrs: {},
};

export const strategyInitiativeProjector: Projector<StrategyInitiativeState> = {
  name: "strategyInitiative",
  interestedIn: [
    "strategy.initiative_created",
    "strategy.initiative_status_changed",
    "strategy.okr_progress_recorded",
  ],
  initial,
  apply(state, e) {
    switch (e.type) {
      case "strategy.initiative_created": {
        const p = e.payload as { initiativeId: string; title: string; owner: string; quarter: string };
        return {
          ...state,
          initiativeId: p.initiativeId,
          title: p.title,
          owner: p.owner,
          quarter: p.quarter,
          status: "on_track",
        };
      }
      case "strategy.initiative_status_changed": {
        const p = e.payload as { status: "on_track" | "at_risk" | "off_track"; note?: string };
        return { ...state, status: p.status, lastNote: p.note ?? state.lastNote };
      }
      case "strategy.okr_progress_recorded": {
        const p = e.payload as { okrId: string; progressPct: number };
        return { ...state, okrs: { ...state.okrs, [p.okrId]: { progressPct: p.progressPct } } };
      }
      default:
        return state;
    }
  },
};
