// src/lib/store.ts
// localStorage persistence for the Signal Board toggle state.
// New storage key for this delivery — "leados-pt-u:v1". ORIGINAL to this
// sandbox; this workspace began from the default Vite scaffold with no
// pre-existing App.tsx, so no other session's key is continued here.

import { RULES } from "./rules";
import { PEOPLE } from "./rules";

export interface SignalState {
  active: Record<string, boolean>; // rule -> on/off
  sev: Record<string, 1 | 2 | 3 | 4 | 5>; // rule -> severity override
  person: Record<string, string>; // rule -> linked person (if personLinked)
  runwayMonths: number;
}

const KEY = "leados-pt-u:v1";

export function defaultState(): SignalState {
  const active: Record<string, boolean> = {};
  const sev: Record<string, 1 | 2 | 3 | 4 | 5> = {};
  const person: Record<string, string> = {};
  RULES.forEach((r, i) => {
    active[r.rule] = false;
    sev[r.rule] = r.baseSev;
    if (r.personLinked) person[r.rule] = PEOPLE[i % PEOPLE.length];
  });
  return { active, sev, person, runwayMonths: 14 };
}

// A reasonable "busy week" preset so the optimizer has something to chew on
// the first time a visitor opens the app.
export function presetScenario(): SignalState {
  const s = defaultState();
  const on = ["R1", "R4", "R7", "R10", "R17", "R19", "R30", "R51", "R73", "R76", "R88", "R103", "R104", "R41"];
  on.forEach((r) => (s.active[r] = true));
  s.runwayMonths = 5;
  return s;
}

export function loadState(): SignalState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return presetScenario();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      active: { ...base.active, ...parsed.active },
      sev: { ...base.sev, ...parsed.sev },
      person: { ...base.person, ...parsed.person },
      runwayMonths: typeof parsed.runwayMonths === "number" ? parsed.runwayMonths : 14,
    };
  } catch {
    return presetScenario();
  }
}

export function saveState(s: SignalState) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function resetState(): SignalState {
  const s = presetScenario();
  saveState(s);
  return s;
}

export function clearState(): SignalState {
  const s = defaultState();
  saveState(s);
  return s;
}
