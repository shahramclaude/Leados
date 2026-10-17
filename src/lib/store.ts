// src/lib/store.ts — localStorage persistence + state mutations.
// New storage key for this sandbox build (not continuing any other
// session's key — this workspace had no prior app state).
import { PEOPLE, buildSeedEvents } from "./seed";
import { RULE_CATALOG } from "./rules";
import type { AppState, SignalState } from "./types";

export const STORAGE_KEY = "leados-sandbox:v1";

function defaultSignals(): Record<string, SignalState> {
  const out: Record<string, SignalState> = {};
  for (const r of RULE_CATALOG) {
    out[r.id] = { ruleId: r.id, active: false, sev: r.sev, lastToggledAt: 0 };
  }
  return out;
}

export function defaultState(): AppState {
  return {
    version: 1,
    signals: defaultSignals(),
    toggleLog: [],
    people: PEOPLE,
    runwayMonths: 14,
    events: buildSeedEvents(),
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.signals || !Array.isArray(parsed.events)) return defaultState();
    // additive-field defaulting for any rules added after a user's last save
    for (const r of RULE_CATALOG) {
      if (!parsed.signals[r.id]) {
        parsed.signals[r.id] = { ruleId: r.id, active: false, sev: r.sev, lastToggledAt: 0 };
      }
    }
    if (!Array.isArray(parsed.toggleLog)) parsed.toggleLog = [];
    if (typeof parsed.runwayMonths !== "number") parsed.runwayMonths = 14;
    return parsed as AppState;
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function toggleSignal(state: AppState, ruleId: string, personId?: string): AppState {
  const cur = state.signals[ruleId];
  const active = !cur.active;
  const next: AppState = {
    ...state,
    signals: {
      ...state.signals,
      [ruleId]: { ...cur, active, personId: active ? personId : cur.personId, lastToggledAt: Date.now() },
    },
    toggleLog: [...state.toggleLog, { ruleId, active, ts: Date.now() }],
  };
  saveState(next);
  return next;
}

export function setSeverity(state: AppState, ruleId: string, sev: 1 | 2 | 3 | 4 | 5): AppState {
  const next: AppState = { ...state, signals: { ...state.signals, [ruleId]: { ...state.signals[ruleId], sev } } };
  saveState(next);
  return next;
}

export function setPersonLink(state: AppState, ruleId: string, personId: string): AppState {
  const next: AppState = { ...state, signals: { ...state.signals, [ruleId]: { ...state.signals[ruleId], personId } } };
  saveState(next);
  return next;
}

export function setRunway(state: AppState, months: number): AppState {
  const next: AppState = { ...state, runwayMonths: months };
  saveState(next);
  return next;
}

export function applyPreset(state: AppState, ruleIds: string[], personId?: string): AppState {
  let next = state;
  for (const id of ruleIds) {
    if (!next.signals[id].active) next = toggleSignal(next, id, personId);
  }
  return next;
}

export function resetState(): AppState {
  const next = defaultState();
  saveState(next);
  return next;
}

export function simulateRecurrence(state: AppState, ruleId: string, cycles = 3): AppState {
  let next = state;
  for (let i = 0; i < cycles; i++) {
    next = toggleSignal(next, ruleId); // on
    next = toggleSignal(next, ruleId); // off
  }
  return next;
}
