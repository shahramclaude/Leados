// store.ts — localStorage persistence + state mutation helpers.
// ORIGINAL to this session. Storage key 'leados-ptn:v1' is new: this
// workspace began from the default Vite scaffold (verified this session —
// see AI-SESSION-LOG.md) with no prior App.tsx beyond the placeholder, so no
// earlier session's key is continued here.

import { AppState, AppEvent, Person, EventType, DEFAULT_SETTINGS, STORAGE_KEY, Settings } from './types';

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyState(): AppState {
  return {
    people: [],
    events: [],
    audit: [{ ts: new Date().toISOString(), action: 'session.started' }],
    settings: { ...DEFAULT_SETTINGS },
    dismissed: [],
    sessionStartedAt: new Date().toISOString(),
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    // defensive merge so older/missing fields never crash the app
    return {
      people: parsed.people ?? [],
      events: parsed.events ?? [],
      audit: parsed.audit ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      dismissed: parsed.dismissed ?? [],
      sessionStartedAt: parsed.sessionStartedAt ?? new Date().toISOString(),
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState(): AppState {
  localStorage.removeItem(STORAGE_KEY);
  return emptyState();
}

export function addPerson(state: AppState, name: string, role: string, reportsTo: string | null): AppState {
  const person: Person = { id: uid('p'), name, role, reportsTo: reportsTo || null };
  const audit = [...state.audit, { ts: new Date().toISOString(), action: 'person.added', ref: name }];
  return { ...state, people: [...state.people, person], audit };
}

export function appendEvent(
  state: AppState,
  type: EventType,
  data: Record<string, any>,
  personId?: string
): AppState {
  const event: AppEvent = { id: uid('e'), ts: new Date().toISOString(), type, personId, data };
  const audit = [...state.audit, { ts: event.ts, action: `event:${type}`, ref: event.id }];
  return { ...state, events: [...state.events, event], audit };
}

export function updateSettings(state: AppState, patch: Partial<Settings>): AppState {
  const settings = { ...state.settings, ...patch };
  const audit = [
    ...state.audit,
    { ts: new Date().toISOString(), action: 'settings.updated', ref: JSON.stringify(patch) },
  ];
  return { ...state, settings, audit };
}

export function dismissFinding(state: AppState, key: string, mode: 'snooze' | 'dismiss'): AppState {
  const dismissed = [...state.dismissed, { key, ts: new Date().toISOString(), mode }];
  const audit = [...state.audit, { ts: new Date().toISOString(), action: `finding.${mode}`, ref: key }];
  return { ...state, dismissed, audit };
}

export function markPlaybookCompleted(state: AppState, playId: string, personId?: string): AppState {
  return appendEvent(state, 'playbook.completed', { playId }, personId);
}
