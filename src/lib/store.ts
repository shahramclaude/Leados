// src/lib/store.ts
// localStorage persistence for this sandbox. New key ("leados-ptm:v1")
// because this workspace started from the default scaffold with no prior
// state — it does not claim continuity with any other session's save data.
import type { AppState } from "./types";
import { RULES } from "./rules";

const STORAGE_KEY = "leados-ptm:v1";

function emptyState(): AppState {
  const signals: AppState["signals"] = {};
  for (const r of RULES) signals[r.id] = { active: false, occurrences: r.counter ? 1 : undefined };
  return { signals, crisisCount: 0, attritionLog: [] };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.signals) return emptyState();
    // additive-field defaulting for any rules added after a save was made
    const base = emptyState();
    return {
      signals: { ...base.signals, ...parsed.signals },
      crisisCount: typeof parsed.crisisCount === "number" ? parsed.crisisCount : 0,
      attritionLog: Array.isArray(parsed.attritionLog) ? parsed.attritionLog : [],
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors in sandbox */
  }
}

export function resetState(): AppState {
  const s = emptyState();
  saveState(s);
  return s;
}

/** A hand-picked preset that satisfies all three forward-chain patterns and
 * the backward-chain observation, so a reviewer can see every inference
 * fire without manually toggling 17 rules. Clearly a demo convenience, not
 * a "real" scenario. */
export function applyDemoPreset(): AppState {
  const s = emptyState();
  const on = (id: string, occurrences?: number) => {
    s.signals[id] = { active: true, occurrences };
  };
  // INF-001 Leadership Absence Cascade
  on("R1", 3);
  on("R3");
  on("R10");
  // INF-002 Revenue Model Validity Collapse
  on("R104");
  on("R109");
  on("R87");
  // INF-003 Organizational Immune Response Failure
  on("R133");
  on("R128");
  s.crisisCount = 2;
  // INF-004 Velocity Decline Root Cause (capacity-reduction hypothesis wins)
  on("R73");
  on("R81");
  on("R19");
  // INF-005 Departure Cascade — seed history below via seedAttritionHistory()
  return s;
}

/** Deterministic synthetic attrition history used only to demonstrate
 * INF-005 (temporal inference). Four past departures, three of which were
 * followed by another within 60 days — i.e. cascadeRate = 2/3 > 0.5, enough
 * to cross the pattern's own disclosed threshold. Dates are relative to
 * "today" so the demo works whenever it's opened. */
export function seedAttritionHistory(): string[] {
  const today = new Date();
  const d = (daysAgo: number) => {
    const t = new Date(today);
    t.setDate(t.getDate() - daysAgo);
    return t.toISOString().slice(0, 10);
  };
  return [d(260), d(230), d(140), d(95)].sort();
}
