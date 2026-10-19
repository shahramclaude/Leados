"use client";
// src/lib/intelligence/useForecastWorker.ts
//
// Client-side hook that offloads a Monte Carlo forecast to
// src/workers/forecastWorker.ts via the browser Worker API, so a large
// trial count never janks the UI thread. Falls back to running
// runMonteCarlo() inline (still non-blocking thanks to its internal chunk
// yielding) if Workers are unavailable (e.g. during SSR or in test
// environments).
import { useCallback, useRef, useState } from "react";
import type { MonteCarloInput, MonteCarloResult } from "./monteCarlo";

interface WorkerMessage {
  ok: boolean;
  result?: MonteCarloResult;
  error?: string;
}

export function useForecastWorker() {
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const run = useCallback(async (input: MonteCarloInput) => {
    setIsRunning(true);
    setError(null);
    try {
      if (typeof Worker !== "undefined") {
        if (!workerRef.current) {
          workerRef.current = new Worker(new URL("../../workers/forecastWorker.ts", import.meta.url));
        }
        const worker = workerRef.current;
        const response: WorkerMessage = await new Promise((resolve, reject) => {
          const handleMessage = (event: MessageEvent<WorkerMessage>) => {
            worker.removeEventListener("message", handleMessage);
            resolve(event.data);
          };
          worker.addEventListener("message", handleMessage);
          worker.addEventListener(
            "error",
            (event) => {
              reject(event.error ?? new Error("Forecast worker error"));
            },
            { once: true },
          );
          worker.postMessage(input);
        });
        if (!response.ok || !response.result) throw new Error(response.error ?? "Forecast worker failed");
        setResult(response.result);
        return response.result;
      }
      const { runMonteCarlo } = await import("./monteCarlo");
      const inline = await runMonteCarlo(input);
      setResult(inline);
      return inline;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsRunning(false);
    }
  }, []);

  return { run, result, isRunning, error };
}
