// localStorage persistence for this sandbox. Original to this delivery.
// Storage key is namespaced to this task's own environment — it does not
// claim continuity with any other session's key (see AI-SESSION-LOG.md).
import type { AppState } from "./types";
import { ROSTER, generateEventLog } from "./seed";

export const STORAGE_KEY = "leados-wargaming-sandbox:v1";

function freshState(): AppState {
  return {
    activeRuleIds: [],
    severityOverrides: {},
    personLinks: {},
    recurrence: {},
    runwayMonths: 9,
    events: generateEventLog(),
    roster: ROSTER,
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.activeRuleIds)) return freshState();
    // additive-field defaulting for forward compatibility
    return {
      activeRuleIds: parsed.activeRuleIds ?? [],
      severityOverrides: parsed.severityOverrides ?? {},
      personLinks: parsed.personLinks ?? {},
      recurrence: parsed.recurrence ?? {},
      runwayMonths: typeof parsed.runwayMonths === "number" ? parsed.runwayMonths : 9,
      events: Array.isArray(parsed.events) && parsed.events.length ? parsed.events : generateEventLog(),
      roster: Array.isArray(parsed.roster) && parsed.roster.length ? parsed.roster : ROSTER,
    };
  } catch {
    return freshState();
  }
}

export function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private-mode errors — state simply won't persist
  }
}

export function resetState(): AppState {
  const s = freshState();
  saveState(s);
  return s;
}
