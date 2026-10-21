"use client";

import { useEffect } from "react";
import { registerBackgroundSync } from "@/lib/platform/integration/backgroundSync";
import { startSyncEngine } from "@/lib/platform/integration/syncEngine";

export function ServiceWorkerRegister() {
  useEffect(() => {
    startSyncEngine();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => registerBackgroundSync())
        .catch(() => undefined);
    }
  }, []);

  return null;
}
