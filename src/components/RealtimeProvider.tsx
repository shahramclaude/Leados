"use client";

// Mounts once near the app root. Hydrates the notification store from the
// REST API (source of truth for read/unread/archived state) and then
// lazily connects the realtime stream for live updates. Rendering nothing
// itself keeps it out of the paint path entirely.

import { useEffect } from "react";
import { useRealtimeIntelligence } from "@/hooks/useRealtimeIntelligence";
import { hydrateNotifications, type StoreNotification } from "@/lib/store/notificationStore";

export function RealtimeProvider() {
  useRealtimeIntelligence();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { notifications: StoreNotification[] };
        if (!cancelled) hydrateNotifications(data.notifications);
      } catch {
        // offline at first paint — the realtime stream will catch us up once connected
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
