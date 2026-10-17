import { buildSeedState } from "./seed";
import type { AppState } from "./types";

export const STORAGE_KEY = "leados-oip:v1";

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildSeedState();
    const parsed = JSON.parse(raw);
    // Shallow-merge over seed so new fields added by later sessions always exist.
    return { ...buildSeedState(), ...parsed };
  } catch {
    return buildSeedState();
  }
}

export function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private-mode errors — in-memory state still works
  }
}

export function resetState(): AppState {
  const fresh = buildSeedState();
  saveState(fresh);
  return fresh;
}
