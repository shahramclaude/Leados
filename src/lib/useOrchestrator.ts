"use client";

import { useCallback, useEffect, useState } from "react";
import type { OrchestratorResult } from "./types";

export interface UseOrchestratorState {
  result: OrchestratorResult | null;
  lastUpdated: Date | null;
  sseConnected: boolean;
  isRunning: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  triggerRun: () => Promise<void>;
}

interface ApiErrorBody {
  error?: string;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return body?.error ?? `Request failed with status ${res.status}`;
  } catch {
    return `Request failed with status ${res.status}`;
  }
}

const POLL_INTERVAL_MS = 30_000;

/**
 * Single hook that owns all orchestrator data-fetching for the whole app.
 * Every view and the Shell read from AppContext (which wraps this hook) —
 * no view fetches /api/orchestrator on its own.
 */
export function useOrchestrator(): UseOrchestratorState {
  const [result, setResult] = useState<OrchestratorResult | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/orchestrator", { cache: "no-store" });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const data = (await res.json()) as OrchestratorResult;
      setResult(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orchestrator data.");
    }
  }, []);

  const triggerRun = useCallback(async () => {
    setIsRunning(true);
    try {
      const res = await fetch("/api/autonomous/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "manual" }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const data = (await res.json()) as { result: OrchestratorResult };
      setResult(data.result);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger autonomous run.");
    } finally {
      setIsRunning(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const source = new EventSource("/api/events/stream");
    const markConnected = () => setSseConnected(true);
    const markDisconnected = () => setSseConnected(false);
    source.addEventListener("connected", markConnected);
    source.addEventListener("heartbeat", markConnected);
    source.onerror = markDisconnected;
    return () => {
      source.removeEventListener("connected", markConnected);
      source.removeEventListener("heartbeat", markConnected);
      source.close();
    };
  }, []);

  return { result, lastUpdated, sseConnected, isRunning, error, refresh, triggerRun };
}
