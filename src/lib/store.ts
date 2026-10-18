// localStorage persistence for the pt-U sandbox. Original to this delivery.
// New storage key — this workspace began from the default Vite scaffold with no
// prior App.tsx, so there is no earlier session's key to continue.
import { generateSeed } from "./seed";
import type { AppState } from "./types";

export const STORAGE_KEY = "leados-ptU:v1";

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* fall through to seed */
  }
  const seeded = generateSeed(42);
  saveState(seeded);
  return seeded;
}

export function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetToSeed(seedNum = Date.now() % 100000): AppState {
  const seeded = generateSeed(seedNum);
  saveState(seeded);
  return seeded;
}

export function daysBetween(ts: string, today: Date): number {
  const d = new Date(ts);
  return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}
