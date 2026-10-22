"use client";

// LEADOS Part 14 — useRealtimeIntelligence
// Lazy-loads src/lib/realtimeClient.ts (kept out of the initial bundle) and
// exposes its rAF-coalesced state via useSyncExternalStore so React only
// re-renders at most once per animation frame even under a frame storm.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RealtimeClient, RealtimeState } from "@/lib/realtimeClient";

const EMPTY_STATE: RealtimeState = {
  connectionState: "connecting",
  frames: [],
  lastEventId: null,
  reconnectAttempts: 0,
  lagNotices: 0,
};

export function useRealtimeIntelligence(userId: string | null, role?: string) {
  const clientRef = useRef<RealtimeClient | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void import("@/lib/realtimeClient").then(({ createRealtimeClient }) => {
      if (cancelled) return;
      const client = createRealtimeClient({ userId, role });
      clientRef.current = client;
      client.start();
      setReady(true);
    });
    return () => {
      cancelled = true;
      clientRef.current?.stop();
      clientRef.current = null;
      setReady(false);
    };
  }, [userId, role]);

  const state = useSyncExternalStore(
    (onStoreChange) => {
      if (!clientRef.current) return () => {};
      return clientRef.current.subscribe(onStoreChange);
    },
    () => clientRef.current?.getState() ?? EMPTY_STATE,
    () => EMPTY_STATE,
  );

  return { ready, state };
}
