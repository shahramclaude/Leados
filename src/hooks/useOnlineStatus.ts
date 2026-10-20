"use client";

// Offline detection (requirement D). This only toggles a banner today — the
// full offline mutation queue is Part 13's scope. The seam: mutation hooks
// in src/lib/data/mutations/** check `navigator.onLine` before firing and
// surface a toast telling the user the write will not retry automatically
// yet, rather than silently failing.
import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
