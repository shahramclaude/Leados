import type { AppState, LeadEvent, Projection } from "./types";
import { buildSeedState } from "./seedData";
import { uid } from "./format";

export const STORAGE_KEY = "leados-pt-o:v1";

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    // fall through to seed
  }
  const seeded = buildSeedState();
  saveState(seeded);
  return seeded;
}

export function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors in sandbox
  }
}

export function resetToSeed(): AppState {
  const seeded = buildSeedState();
  saveState(seeded);
  return seeded;
}

export function wipeAll(): AppState {
  const empty: AppState = { events: [], people: [], openOkrs: [], openDeals: [] };
  saveState(empty);
  return empty;
}

export function appendEvent(state: AppState, type: string, data: Record<string, any>, ts?: string): AppState {
  const ev: LeadEvent = { id: uid(), ts: ts || new Date().toISOString(), type, data };
  const next = { ...state, events: [...state.events, ev].sort((a, b) => (a.ts > b.ts ? 1 : -1)) };
  saveState(next);
  return next;
}

export function deleteEvent(state: AppState, id: string): AppState {
  const next = { ...state, events: state.events.filter((e) => e.id !== id) };
  saveState(next);
  return next;
}

export function toProjection(state: AppState): Projection {
  return {
    people: state.people,
    openOkrs: state.openOkrs,
    openDeals: state.openDeals,
    state: { events: state.events },
  };
}
