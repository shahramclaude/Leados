// src/lib/store.ts
//
// Append-only localStorage persistence for the event log. ORIGINAL to this
// sandbox session. Storage key is namespaced "leados-pt-l" to mark this as
// a fresh, standalone delivery for this part of the series (see
// AI-SESSION-LOG.md on why this does not continue any prior sandbox state).

import type { OrgEvent, Person, Projection } from "./types";
import { ROSTER, generateSeedEvents, DEMO_SEED } from "./seed";

const STORAGE_KEY = "leados-pt-l:events";

export function loadEvents(): OrgEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = generateSeedEvents(DEMO_SEED);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("bad shape");
    return parsed;
  } catch {
    const seeded = generateSeedEvents(DEMO_SEED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

export function saveEvents(events: OrgEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export function appendEvent(events: OrgEvent[], type: string, data: Record<string, any>, ts?: string): OrgEvent[] {
  const id = `ev_u_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const next = [...events, { id, type, ts: ts || new Date().toISOString().slice(0, 10), data }];
  saveEvents(next);
  return next;
}

export function resetToSeed(): OrgEvent[] {
  const seeded = generateSeedEvents(DEMO_SEED);
  saveEvents(seeded);
  return seeded;
}

export function wipeEvents(): OrgEvent[] {
  saveEvents([]);
  return [];
}

export function buildProjection(events: OrgEvent[]): Projection {
  const self = ROSTER.find((p) => p.level === "self")!;
  const directs = ROSTER.filter((p) => p.level === "direct");
  const skips = ROSTER.filter((p) => p.level === "skip");
  return { self, directs, skips, state: { events } };
}

export function personById(id: string): Person | undefined {
  return ROSTER.find((p) => p.id === id);
}

export { ROSTER };
