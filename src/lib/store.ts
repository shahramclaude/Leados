// Persistence + event-log projection for LeadOS pt-Q.
// ORIGINAL to this build. Storage key is new (`leados-ptq:v1`) — this sandbox
// began from the default scaffold with no prior app state to continue.
import type { AppState, LeadEvent, Projection } from './types';
import { buildSeedState } from './seed';

const STORAGE_KEY = 'leados-ptq:v1';

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
    /* quota or private-mode — silently skip, non-critical for a demo */
  }
}

export function resetState(): AppState {
  const seeded = buildSeedState();
  saveState(seeded);
  return seeded;
}

export function appendEvent(state: AppState, type: LeadEvent['type'], data: Record<string, any>, ts?: string): AppState {
  const ev: LeadEvent = { id: 'e_' + Math.random().toString(36).slice(2), type, ts: ts || new Date().toISOString(), data };
  const next = { ...state, events: [...state.events, ev] };
  saveState(next);
  return next;
}

// Builds the queryable projection `P` used throughout the causal / flight-risk
// engines, mirroring the shape implied by the pasted pt-Q spec
// (P.directs, P.skips, P.peopleById, P.pulsesByPerson, ...).
export function project(state: AppState): Projection {
  const people = state.people.filter((p) => !p.archived);
  const peopleById: Projection['peopleById'] = {};
  state.people.forEach((p) => (peopleById[p.id] = p));

  const pulsesByPerson: Projection['pulsesByPerson'] = {};
  const feedbackByPerson: Projection['feedbackByPerson'] = {};
  const oneononeLast: Projection['oneononeLast'] = {};
  const planOpenSet = new Map<string, string>(); // personId -> planId (open)

  // sort events chronologically for "last" lookups
  const sorted = [...state.events].sort((a, b) => a.ts.localeCompare(b.ts));

  for (const e of sorted) {
    if (e.type === 'pulse.logged') {
      const arr = pulsesByPerson[e.data.personId] || (pulsesByPerson[e.data.personId] = []);
      arr.push({ ts: e.ts, mood: e.data.mood, load: e.data.load });
    } else if (e.type === 'feedback.logged') {
      const arr = feedbackByPerson[e.data.personId] || (feedbackByPerson[e.data.personId] = []);
      arr.push({ ts: e.ts, polarity: e.data.polarity, note: e.data.note });
    } else if (e.type === 'oneonone.logged') {
      const prev = oneononeLast[e.data.personId];
      if (!prev || e.ts > prev.ts) oneononeLast[e.data.personId] = { ts: e.ts };
    } else if (e.type === 'growthplan.opened') {
      planOpenSet.set(e.data.personId, e.data.planId);
    } else if (e.type === 'growthplan.closed') {
      planOpenSet.delete(e.data.personId);
    }
  }

  const openPlans = Array.from(planOpenSet.entries()).map(([personId, planId]) => ({ personId, planId }));

  return {
    state,
    people,
    directs: people.filter((p) => p.level === 'direct'),
    skips: people.filter((p) => p.level === 'skip'),
    peopleById,
    pulsesByPerson,
    feedbackByPerson,
    oneononeLast,
    openPlans,
    openGoals: [],
  };
}

export { STORAGE_KEY };
