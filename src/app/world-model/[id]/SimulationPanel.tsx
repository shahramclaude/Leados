"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FanChart, type BandPoint, type HistoryPoint } from "@/components/FanChart";
import { Badge, Label, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

interface Props {
  metricId: string;
  history: HistoryPoint[];
  latestBands: BandPoint[] | null;
  observationCount: number;
}

export function SimulationPanel({ metricId, history, latestBands, observationCount }: Props) {
  const router = useRouter();
  const [horizon, setHorizon] = useState(6);
  const [trials, setTrials] = useState(1000);
  const [seed, setSeed] = useState(42);
  const [useIntervention, setUseIntervention] = useState(false);
  const [interventionFromStep, setInterventionFromStep] = useState(1);
  const [interventionDelta, setInterventionDelta] = useState(0);
  const [bands, setBands] = useState<BandPoint[] | null>(latestBands);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cutoffPeriod, setCutoffPeriod] = useState(history.length > 3 ? history[history.length - 4].period : "");
  const [backtestHorizon, setBacktestHorizon] = useState(3);
  const [backtestResult, setBacktestResult] = useState<{ withinInterval: boolean; p10: number; p50: number; p90: number; actual: number; targetPeriod: string } | null>(null);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [runningBacktest, setRunningBacktest] = useState(false);

  async function runSimulation(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metricId,
          horizon,
          trials,
          seed,
          ...(useIntervention ? { interventionFromStep, interventionDelta } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Simulation failed.");
        return;
      }
      setBands(data.bands);
      router.refresh();
    } catch {
      setError("Network error — please retry.");
    } finally {
      setRunning(false);
    }
  }

  async function runBacktest(e: React.FormEvent) {
    e.preventDefault();
    setRunningBacktest(true);
    setBacktestError(null);
    setBacktestResult(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricId, cutoffPeriod, horizon: backtestHorizon }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBacktestError(data.error === "no_ground_truth_yet" ? "No observation exists yet for that target period." : data.error ?? "Backtest failed.");
        return;
      }
      setBacktestResult({
        withinInterval: data.backtest.withinInterval,
        p10: Number(data.backtest.p10),
        p50: Number(data.backtest.p50),
        p90: Number(data.backtest.p90),
        actual: Number(data.backtest.actual),
        targetPeriod: data.backtest.targetPeriod,
      });
      router.refresh();
    } catch {
      setBacktestError("Network error — please retry.");
    } finally {
      setRunningBacktest(false);
    }
  }

  return (
    <div className="space-y-6">
      <FanChart history={history} bands={bands ?? undefined} />

      <form onSubmit={runSimulation} className="grid gap-3 sm:grid-cols-6 sm:items-end">
        <div>
          <Label htmlFor="sim-horizon">Horizon (periods)</Label>
          <input id="sim-horizon" type="number" min={1} max={36} className={inputClass} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} />
        </div>
        <div>
          <Label htmlFor="sim-trials">Trials</Label>
          <input id="sim-trials" type="number" min={10} max={5000} className={inputClass} value={trials} onChange={(e) => setTrials(Number(e.target.value))} />
        </div>
        <div>
          <Label htmlFor="sim-seed">Seed</Label>
          <input id="sim-seed" type="number" min={0} className={inputClass} value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <input id="sim-intervene" type="checkbox" checked={useIntervention} onChange={(e) => setUseIntervention(e.target.checked)} />
          <label htmlFor="sim-intervene" className="text-xs font-medium text-slate-600">
            Intervention
          </label>
        </div>
        {useIntervention && (
          <>
            <div>
              <Label htmlFor="sim-intervene-step">From step</Label>
              <input
                id="sim-intervene-step"
                type="number"
                min={1}
                max={horizon}
                className={inputClass}
                value={interventionFromStep}
                onChange={(e) => setInterventionFromStep(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="sim-intervene-delta">Per-step delta</Label>
              <input
                id="sim-intervene-delta"
                type="number"
                className={inputClass}
                value={interventionDelta}
                onChange={(e) => setInterventionDelta(Number(e.target.value))}
              />
            </div>
          </>
        )}
        <div>
          <button type="submit" className={buttonClass} disabled={running || observationCount === 0}>
            {running ? "Simulating…" : "Run simulation"}
          </button>
        </div>
        {error && <p className="col-span-full text-sm text-rose-600">{error}</p>}
      </form>

      <div className="rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Backtest (calibration check)</h3>
        <p className="mt-1 text-xs text-slate-500">
          Fits only on data up to the cutoff period, simulates forward, and compares the P10–P90 band to what actually
          happened — this is how the calibration gate on the overview page is measured, never asserted.
        </p>
        <form onSubmit={runBacktest} className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
          <div>
            <Label htmlFor="bt-cutoff">Cutoff period</Label>
            <input id="bt-cutoff" type="date" className={inputClass} value={cutoffPeriod} onChange={(e) => setCutoffPeriod(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="bt-horizon">Horizon (periods)</Label>
            <input
              id="bt-horizon"
              type="number"
              min={1}
              max={36}
              className={inputClass}
              value={backtestHorizon}
              onChange={(e) => setBacktestHorizon(Number(e.target.value))}
            />
          </div>
          <div>
            <button type="submit" className={secondaryButtonClass} disabled={runningBacktest}>
              {runningBacktest ? "Running…" : "Run backtest"}
            </button>
          </div>
          {backtestError && <p className="col-span-full text-sm text-rose-600">{backtestError}</p>}
        </form>
        {backtestResult && (
          <p className="mt-3 text-sm text-slate-700">
            <Badge tone={backtestResult.withinInterval ? "green" : "red"}>{backtestResult.withinInterval ? "within interval" : "miss"}</Badge>{" "}
            Target {backtestResult.targetPeriod}: actual {backtestResult.actual.toLocaleString()} vs forecast P10{" "}
            {backtestResult.p10.toFixed(1)} / P50 {backtestResult.p50.toFixed(1)} / P90 {backtestResult.p90.toFixed(1)}
          </p>
        )}
      </div>
    </div>
  );
}
