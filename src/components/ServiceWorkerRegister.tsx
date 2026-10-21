"use client";

import { useEffect } from "react";
import { flushQueue } from "@/lib/offlineQueue";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: app still works online without the SW.
      });
    }
    const onOnline = () => {
      flushQueue().catch(() => undefined);
    };
    window.addEventListener("online", onOnline);
    if (navigator.onLine) onOnline();
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return null;
}
