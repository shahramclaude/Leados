// Flat event-log storage, modeled loosely on the "one flat event log,
// nothing derived is stored" pattern described in wbweve/Leados's own
// README for its index.html build (verified read, see AI-SESSION-LOG.md).
// The schema itself (field names, event types) is ORIGINAL to this build.

import type { AppEvent, EventType } from "./types";

const LS_KEY = "leados-lite:events";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function loadEvents(): AppEvent[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AppEvent[];
  } catch {
    return [];
  }
}

export function saveEvents(events: AppEvent[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(events));
  } catch {
    // storage unavailable (private browsing / quota) — fail silently,
    // the app still works in-memory for the session.
  }
}

export function appendEvent<T extends Record<string, unknown>>(
  type: EventType,
  payload: T
): AppEvent<T> {
  const events = loadEvents();
  const evt: AppEvent<T> = { id: uid(), type, ts: new Date().toISOString(), payload };
  events.push(evt as AppEvent);
  saveEvents(events);
  return evt;
}

export function wipeEvents() {
  saveEvents([]);
}
