"use client";

// Preferences (theme/density/locale) are read through this ONE hook, per
// the state taxonomy in docs/FRONTEND.md. Persisted to localStorage now;
// the hook's surface (read + set) is what a future profile-table-backed
// implementation would preserve, so call sites never need to change.
import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
export type Density = "comfortable" | "compact";

export interface Preferences {
  theme: Theme;
  density: Density;
  locale: string;
}

const STORAGE_KEY = "leados.preferences.v1";
const DEFAULTS: Preferences = { theme: "system", density: "comfortable", locale: "en-US" };
const CHANGE_EVENT = "leados:preferences-changed";

let cache: Preferences | null = null;

function readFromStorage(): Preferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) };
  } catch {
    return DEFAULTS;
  }
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

function getSnapshot(): Preferences {
  if (!cache) cache = readFromStorage();
  return cache;
}

function getServerSnapshot(): Preferences {
  return DEFAULTS;
}

export function usePreferences(): [Preferences, (patch: Partial<Preferences>) => void] {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setPreference = useCallback((patch: Partial<Preferences>) => {
    cache = { ...readFromStorage(), ...patch };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [prefs, setPreference];
}
