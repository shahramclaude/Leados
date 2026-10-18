// localStorage persistence. One key, read/write guarded with try/catch.
// Original to this delivery — new key (`leados-ptv:v1`) because this
// workspace began from the default scaffold with no prior LeadOS state,
// so claiming continuity with any other session's storage key would be false.

import type { AppState, LeadosEvent } from './types';
import { buildInitialState } from './seed';

const KEY = 'leados-ptv:v1';
let idCounter = Date.now();

export function mintId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}`;
}

export function load(today: Date): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const fresh = buildInitialState(today);
      save(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !Array.isArray(parsed.events) || !Array.isArray(parsed.roster)) {
      throw new Error('malformed state');
    }
    return parsed;
  } catch {
    const fresh = buildInitialState(today);
    save(fresh);
    return fresh;
  }
}

export function save(state: AppState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function appendEvent(state: AppState, ev: Omit<LeadosEvent, 'id'> & { id?: string }): AppState {
  const full: LeadosEvent = { id: ev.id ?? mintId('ev'), ts: ev.ts, type: ev.type, data: ev.data };
  const next: AppState = { ...state, events: [...state.events, full] };
  save(next);
  return next;
}

export function resetToSeed(today: Date): AppState {
  const fresh = buildInitialState(today);
  save(fresh);
  return fresh;
}

export function updateSettings(state: AppState, patch: Record<string, any>): AppState {
  const next: AppState = { ...state, settings: { ...state.settings, ...patch } };
  save(next);
  return next;
}

export const STORAGE_KEY = KEY;
