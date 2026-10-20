"use client";

import { useEffect, useRef, useState } from "react";
import { ChartPanelSkeleton } from "./Skeletons";
import LineChart from "./charts/LineChart";
import { getComputeWorkerPool } from "@/workers/computeWorkerPool";
import { mean, stdDev } from "@/lib/mathUtils";
import type { DailyBucket } from "@/lib/stats";


type ForecastPayload = {
  horizonDays: number;
  projected: { day: number; expected: number; low: number; high: number }[];
};

type MonteCarloResult = { p10: number; p50: number; p90: number; mean: number; trials: number; days: number };

export function ForecastPanel({ buckets, forecast }: { buckets: DailyBucket[]; forecast: ForecastPayload }) {
  const [simResult, setSimResult] = useState<MonteCarloResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);

  // Ticks once a second purely to make main-thread responsiveness visible
  // while a 50k-trial simulation runs in the worker.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const runSimulation = () => {
    const daily = buckets.map((b) => b.total);
    const meanDaily = mean(daily) || 10;
    const stdDevDaily = stdDev(daily) || meanDaily * 0.3;

    setRunning(true);
    setProgress(0);
    setSimResult(null);

    const pool = getComputeWorkerPool();
    const { promise, cancel } = pool.runMonteCarlo(
      { trials: 50000, days: forecast.horizonDays, meanDaily, stdDevDaily },
      (p) => setProgress(p),
    );
    cancelRef.current = cancel;

    promise
      .then((result) => setSimResult(result))
      .catch(() => {
        /* cancelled */
      })
      .finally(() => setRunning(false));
  };

  const cancelSimulation = () => {
    cancelRef.current?.();
    setRunning(false);
  };

  const chartPoints = forecast.projected.map((p) => ({ x: p.day, y: p.expected }));
  const band = forecast.projected.map((p) => ({ low: p.low, high: p.high }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          {forecast.horizonDays}-day forecast (trend, server-cached)
        </h3>
        <span className="text-xs text-slate-400">main-thread tick: {tick}s</span>
      </div>

      <LineChart points={chartPoints} band={band} label="Forecast trend with confidence band" height={220} />

      <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
        {!running ? (
          <button
            onClick={runSimulation}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Run 50,000-trial Monte Carlo (worker)
          </button>
        ) : (
          <button
            onClick={cancelSimulation}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
          >
            Cancel simulation
          </button>
        )}
        {running && (
          <div className="flex flex-1 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-100">
              <div className="h-full bg-blue-500 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <span className="w-10 text-right text-xs text-slate-400">{Math.round(progress * 100)}%</span>
          </div>
        )}
        {simResult && !running && (
          <span className="text-xs text-slate-500">
            P10 {simResult.p10.toFixed(0)} · P50 {simResult.p50.toFixed(0)} · P90 {simResult.p90.toFixed(0)}
          </span>
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        The ticking clock above keeps updating every second while the simulation runs — proof the UI thread is never
        blocked by the 50,000-trial computation running in a Web Worker.
      </p>
    </div>
  );
}

export default ForecastPanel;
