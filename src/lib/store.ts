// localStorage-backed app state. New key for this workspace — there is no prior
// session state in this sandbox to be compatible with (verified: this project
// started from the default Vite/React/Tailwind scaffold, see AI-SESSION-LOG.md).

import type { AppState, FeedbackRecord, IncidentRecord, Severity, SignalBoard } from "./types";
import { RULES } from "./rules";

export const STORAGE_KEY = "leados-sandbox:v2";

function defaultSignalBoard(): SignalBoard {
  const board: SignalBoard = {};
  for (const r of RULES) {
    board[r.id] = { active: false, severity: r.baseSeverity, recurrence: 0 };
  }
  return board;
}

export function defaultState(): AppState {
  return {
    signalBoard: defaultSignalBoard(),
    runwayMonths: 12,
    feedback: [],
    incidents: [],
    autonomousLog: [],
    autonomousTick: 0,
    onboarding: {
      completed: false,
      step: 0,
      baseline: { teamSize: 12, managerSpan: 6, teamAgeMonths: 10, runwayMonths: 12 },
    },
  };
}

export function loadState(): AppState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const base = defaultState();
    // Shallow-merge so new fields introduced after a user already has state
    // still get sane defaults instead of throwing.
    return {
      ...base,
      ...parsed,
      signalBoard: { ...base.signalBoard, ...(parsed.signalBoard ?? {}) },
      onboarding: { ...base.onboarding, ...(parsed.onboarding ?? {}) },
    };
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState(): AppState {
  const fresh = defaultState();
  saveState(fresh);
  return fresh;
}

export function toggleRule(state: AppState, ruleId: string, severity?: Severity): AppState {
  const current = state.signalBoard[ruleId];
  if (!current) return state;
  const nextActive = !current.active;
  const next: SignalBoard = {
    ...state.signalBoard,
    [ruleId]: {
      ...current,
      active: nextActive,
      severity: severity ?? current.severity,
      recurrence: nextActive ? current.recurrence + 1 : current.recurrence,
    },
  };
  return { ...state, signalBoard: next };
}

export function setRunway(state: AppState, months: number): AppState {
  return { ...state, runwayMonths: months };
}

export function addFeedback(state: AppState, record: FeedbackRecord): AppState {
  return { ...state, feedback: [...state.feedback, record] };
}

export function addIncident(state: AppState, record: IncidentRecord): AppState {
  return { ...state, incidents: [...state.incidents, record] };
}
