"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/providers/LocaleProvider";
import { initOfflineQueueAutoFlush } from "@/lib/offlineQueue";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const t = useT();

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const cleanup = initOfflineQueueAutoFlush();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      cleanup();
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-30 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950"
    >
      {t("pwa.offline.banner")}
    </div>
  );
}
