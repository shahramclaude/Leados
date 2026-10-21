"use client";

// ---------------------------------------------------------------------------
// Subscribes to the SSE audit stream and exposes "events since mount" plus
// "what changed since last visit". Incoming events are buffered and flushed
// at most once per animation frame (rAF coalescing) so a burst of N events
// from the server produces exactly one React commit, not N.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import type { AuditEntryDTO } from "@/lib/state/entityStore";

export function useRealtimeIntelligence(options?: { enabled?: boolean }) {
  const [events, setEvents] = useState<AuditEntryDTO[]>([]);
  const [connected, setConnected] = useState(false);
  const bufferRef = useRef<AuditEntryDTO[]>([]);
  const frameRef = useRef<number | null>(null);
  const renderCountRef = useRef(0);

  useEffect(() => {
    if (options?.enabled === false) return;
    const source = new EventSource("/api/realtime/stream");

    source.addEventListener("hello", () => setConnected(true));
    source.addEventListener("ping", () => setConnected(true));
    source.addEventListener("audit", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as AuditEntryDTO;
      bufferRef.current.push(payload);
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(() => {
          const batch = bufferRef.current;
          bufferRef.current = [];
          frameRef.current = null;
          renderCountRef.current += 1;
          setEvents((prev) => [...batch.reverse(), ...prev].slice(0, 50));
        });
      }
    });
    source.onerror = () => setConnected(false);

    return () => {
      source.close();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [options?.enabled]);

  return { events, connected, renderCount: renderCountRef.current };
}
