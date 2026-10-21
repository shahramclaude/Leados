"use client";

// ---------------------------------------------------------------------------
// Prefers the Background Sync API (works even if the tab is closed before
// reconnect) and falls back to the `online` event handled by syncEngine when
// unsupported (Safari/Firefox). Feature-detected — never assumed.
// ---------------------------------------------------------------------------

import { drain } from "./syncEngine";

export async function registerBackgroundSync() {
  if (typeof window === "undefined") return { supported: false };
  if (!("serviceWorker" in navigator)) return { supported: false };

  try {
    const registration = await navigator.serviceWorker.ready;
    const syncManager = (registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    }).sync;
    if (!syncManager) return { supported: false };
    await syncManager.register("leados-mutation-replay");
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "leados:replay") void drain();
    });
    return { supported: true };
  } catch {
    return { supported: false };
  }
}
