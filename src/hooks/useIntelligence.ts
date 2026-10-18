"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Finding } from "@/lib/intelligence";

export interface IntelligenceResponse {
  generatedAt: string;
  findings: Finding[];
  metricsSnapshot: Record<string, number>;
  activePlaybooks: number;
  counts: {
    people: number;
    events: number;
    findings: number;
    critical: number;
    pendingWork: number;
  };
}

export function useIntelligence(pollMs = 30000) {
  const [data, setData] = useState<IntelligenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetch_ = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/intelligence", { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const json = (await res.json()) as IntelligenceResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  // Baseline poll — fallback in case SSE is unavailable.
  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, pollMs);
    return () => clearInterval(id);
  }, [fetch_, pollMs]);

  // Real-time refresh via Server-Sent Events.
  useEffect(() => {
    let es: EventSource | undefined;
    try {
      es = new EventSource("/api/events/stream");
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.type === "refresh") fetch_();
        } catch {
          // ignore malformed payloads / keep-alive comments
        }
      };
      es.onerror = () => {
        // SSE failed — the 30s poll above covers us.
      };
    } catch {
      // EventSource unsupported — polling still covers refresh.
    }
    return () => es?.close();
  }, [fetch_]);

  return { data, loading, error, refetch: fetch_ };
}
