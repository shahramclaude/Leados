import type { LeadosEvent } from './types';
import { buildSeedEvents } from './seed';

const STORAGE_KEY = 'leados.events.v1';

export function loadEvents(): LeadosEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LeadosEvent[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fall through to reseed
  }
  const seeded = buildSeedEvents();
  saveEvents(seeded);
  return seeded;
}

export function saveEvents(events: LeadosEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // ignore quota errors in demo context
  }
}

export function appendEvent(evt: LeadosEvent): LeadosEvent[] {
  const events = loadEvents();
  const next = [...events, evt];
  saveEvents(next);
  return next;
}

export function resetToSeed(): LeadosEvent[] {
  const seeded = buildSeedEvents();
  saveEvents(seeded);
  return seeded;
}
