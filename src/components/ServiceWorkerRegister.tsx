"use client";

import { useEffect } from "react";
import { initAutoFlush } from "@/lib/offline/queue";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support degrades gracefully if registration fails (e.g. in
        // a non-HTTPS preview); the app still works online.
      });
    }
    initAutoFlush();
  }, []);

  return null;
}
