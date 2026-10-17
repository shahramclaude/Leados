// Original to this delivery. localStorage persistence for the synthetic,
// single-organization event log. New storage key — this sandbox began from the
// default Vite scaffold, so no prior session's key is being continued.

import type { AppState, OrgEvent } from "./types";
import { PRESETS, type PresetEvent } from "./presets";

export const STORAGE_KEY = "leados-ptp-maturity:v1";

let tsCounter = 0;

function makeEvent(pe: PresetEvent | { type: string; personId?: string; data?: Record<string, unknown> }): OrgEvent {
  tsCounter += 1;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: pe.type,
    ts: tsCounter,
    personId: pe.personId,
    data: pe.data,
  };
}

function defaultState(): AppState {
  return { events: [], orgName: "Untitled Organization", presetApplied: null };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !Array.isArray(parsed.events)) return defaultState();
    tsCounter = parsed.events.length;
    return parsed;
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private-mode errors — state stays in memory for this session
  }
}

export function addEvent(state: AppState, type: string, extra?: { personId?: string; data?: Record<string, unknown> }): AppState {
  const next = { ...state, events: [...state.events, makeEvent({ type, ...extra })] };
  saveState(next);
  return next;
}

export function removeEvent(state: AppState, id: string): AppState {
  const next = { ...state, events: state.events.filter((e) => e.id !== id) };
  saveState(next);
  return next;
}

export function applyPreset(state: AppState, presetId: string): AppState {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return state;
  const next: AppState = {
    ...state,
    events: preset.events.map((pe) => makeEvent(pe)),
    presetApplied: preset.id,
  };
  saveState(next);
  return next;
}

export function resetState(): AppState {
  const next = defaultState();
  tsCounter = 0;
  saveState(next);
  return next;
}

export function setOrgName(state: AppState, orgName: string): AppState {
  const next = { ...state, orgName };
  saveState(next);
  return next;
}
