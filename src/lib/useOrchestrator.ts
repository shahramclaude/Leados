"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FindingsDeltaEvent, OrchestratorResult } from "@/lib/types";

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_CAP_MS = 30_000;

export interface UseOrchestratorState {
  /** Full orchestrator payload — see `OrchestratorResult` in src/lib/types.ts */
  result: OrchestratorResult | null;
  lastUpdated: Date | null;
  connected: boolean;
  running: boolean;
  error: string | null;
  triggerRun: () => Promise<void>;
}

async function fetchFullResult(): Promise<OrchestratorResult> {
  const res = await fetch("/api/orchestrate", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/orchestrate failed (${res.status})`);
  return (await res.json()) as OrchestratorResult;
}

/**
 * Connects to the Part 1 SSE endpoint (`/api/events/stream`), keeps a live
 * `OrchestratorResult` in memory, and merges `findings_delta` events into it.
 * Auto-reconnects with exponential backoff (capped at 30s) and re-fetches
 * the full result on mount and on every reconnect.
 */
export function useOrchestrator(): UseOrchestratorState {
  const [result, setResult] = useState<OrchestratorResult | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceRef = useRef<EventSource | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_BASE_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const refetchFull = useCallback(async () => {
    try {
      const data = await fetchFullResult();
      if (!mountedRef.current) return;
      setResult(data);
      setLastUpdated(new Date(data.generatedAt));
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load orchestrator result");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;
      const source = new EventSource("/api/events/stream");
      sourceRef.current = source;

      source.addEventListener("connected", () => {
        if (!mountedRef.current) return;
        setConnected(true);
        reconnectDelayRef.current = RECONNECT_BASE_MS;
        // Re-fetch the full result on every (re)connect.
        void refetchFull();
      });

      source.addEventListener("findings_delta", (event) => {
        if (!mountedRef.current) return;
        try {
          const payload = JSON.parse((event as MessageEvent).data) as FindingsDeltaEvent;
          setResult((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              generatedAt: payload.generatedAt,
              orgHealthScore: payload.orgHealthScore,
              priorOrgHealthScore: payload.priorOrgHealthScore,
              domainScores: payload.domainScores,
              findings: payload.findings,
              ruleEvaluations: payload.ruleEvaluations,
              heatmap: payload.heatmap,
            };
          });
          setLastUpdated(new Date(payload.generatedAt));
        } catch (err) {
          console.error("Failed to parse findings_delta payload", err);
        }
      });

      source.onerror = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        source.close();
        if (sourceRef.current === source) sourceRef.current = null;

        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_CAP_MS);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    };

    // Initial full fetch (so the UI has data even before the stream opens).
    void refetchFull();
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [refetchFull]);

  const triggerRun = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/orchestrate", { method: "POST" });
      if (!res.ok) throw new Error(`POST /api/orchestrate failed (${res.status})`);
      const data = (await res.json()) as OrchestratorResult;
      setResult(data);
      setLastUpdated(new Date(data.generatedAt));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run orchestrator");
    } finally {
      setRunning(false);
    }
  }, []);

  return { result, lastUpdated, connected, running, error, triggerRun };
}
