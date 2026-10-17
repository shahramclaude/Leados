import { useState } from "react";
import { Card } from "./Card";
import { runMonteCarlo, simulateWorkerFailure, resetWorker, workerStatus } from "../lib/workers";
import type { Decision, DecisionType, MonteCarloResult, Scenario } from "../lib/types";

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

const DEFAULT_DECISION = (): Decision => ({
  id: uid(),
  title: "APAC expansion",
  type: "strategy.decision",
  createdAt: new Date().toISOString(),
  scenarios: [
    { id: uid(), label: "Strong adoption", probability: 0.3, impact: 400, spread: 60 },
    { id: uid(), label: "Modest adoption", probability: 0.5, impact: 80, spread: 40 },
    { id: uid(), label: "Underperforms", probability: 0.2, impact: -150, spread: 50 },
  ],
});

export function DecisionsView({ onRun }: { onRun: (d: Decision, r: MonteCarloResult) => void }) {
  const [decision, setDecision] = useState<Decision>(DEFAULT_DECISION());
  const [iterations, setIterations] = useState(1000);
  const [seed, setSeed] = useState(42);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(workerStatus());

  function updateScenario(id: string, patch: Partial<Scenario>) {
    setDecision((d) => ({ ...d, scenarios: d.scenarios.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }

  function addScenario() {
    setDecision((d) => ({
      ...d,
      scenarios: [...d.scenarios, { id: uid(), label: "New scenario", probability: 0.1, impact: 0, spread: 20 }],
    }));
  }

  function removeScenario(id: string) {
    setDecision((d) => ({ ...d, scenarios: d.scenarios.filter((s) => s.id !== id) }));
  }

  async function run() {
    setRunning(true);
    const r = await runMonteCarlo(decision.scenarios, iterations, seed);
    setResult(r);
    setStatus(workerStatus());
    setRunning(false);
    onRun(decision, r);
  }

  const probSum = decision.scenarios.reduce((s, sc) => s + sc.probability, 0);

  return (
    <div className="space-y-6">
      <Card title="Decision">
        <div className="flex flex-wrap gap-4">
          <label className="flex-1 min-w-[220px] text-sm">
            Title
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={decision.title}
              onChange={(e) => setDecision((d) => ({ ...d, title: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            Type
            <select
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={decision.type}
              onChange={(e) => setDecision((d) => ({ ...d, type: e.target.value as DecisionType }))}
            >
              {["hire", "termination-prep", "strategy.decision", "vendor", "budget", "other"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <Card title={`Scenarios (probabilities sum to ${probSum.toFixed(2)}${probSum !== 1 ? " — normalized automatically" : ""})`}>
        <div className="space-y-3">
          {decision.scenarios.map((s) => (
            <div key={s.id} className="grid grid-cols-12 items-center gap-2 text-sm">
              <input
                className="col-span-4 rounded-md border border-slate-300 px-2 py-1.5"
                value={s.label}
                onChange={(e) => updateScenario(s.id, { label: e.target.value })}
              />
              <NumField label="prob" value={s.probability} step={0.05} onChange={(v) => updateScenario(s.id, { probability: v })} />
              <NumField label="impact $k" value={s.impact} step={10} onChange={(v) => updateScenario(s.id, { impact: v })} />
              <NumField label="± spread" value={s.spread} step={5} onChange={(v) => updateScenario(s.id, { spread: v })} />
              <button
                onClick={() => removeScenario(s.id)}
                className="col-span-1 text-slate-400 hover:text-red-500"
                aria-label={`Remove scenario ${s.label}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button onClick={addScenario} className="mt-3 text-sm font-medium text-indigo-600 hover:underline">
          + add scenario
        </button>
      </Card>

      <Card title="Run">
        <div className="flex flex-wrap items-end gap-4">
          <NumField label="iterations" value={iterations} step={500} onChange={setIterations} />
          <NumField label="seed" value={seed} step={1} onChange={setSeed} />
          <button
            onClick={run}
            disabled={running}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {running ? "Running…" : "Run Monte Carlo"}
          </button>
          <button
            onClick={() => {
              simulateWorkerFailure();
              setStatus(workerStatus());
            }}
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100"
            title="Terminates the worker to prove the main-thread fallback works"
          >
            Simulate worker failure
          </button>
          <button
            onClick={() => {
              resetWorker();
              setStatus(workerStatus());
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Reset worker
          </button>
          <span className="text-xs text-slate-400">worker status: {status}</span>
        </div>
      </Card>

      {result && (
        <Card title="Result">
          <div className="mb-2 text-xs text-slate-400">
            computed via <span className="font-mono">{result.computedVia}</span> in{" "}
            <span className="font-mono">{result.ms}ms</span> · seed <span className="font-mono">{result.seed}</span> ·{" "}
            {result.iterations} iterations (same seed ⇒ same result, reproducible)
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Stat label="Mean" value={result.mean.toFixed(1)} />
            <Stat label="Median" value={result.median.toFixed(1)} />
            <Stat label="P10" value={result.p10.toFixed(1)} />
            <Stat label="P90" value={result.p90.toFixed(1)} />
            <Stat label="P(positive)" value={`${Math.round(result.probPositive * 100)}%`} />
          </div>
          <div className="mt-5 flex h-32 items-end gap-1">
            {result.histogram.map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="hist-bar w-full rounded-t bg-indigo-400 transition-[height]"
                  style={{ height: `${Math.max(2, h.pct * 2)}px` }}
                  title={`${h.bucket}: ${h.pct}%`}
                />
                <span className="text-[9px] text-slate-400">{h.bucket}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Histogram bucket percentages sum to ≈100% (small rounding differences expected).
          </p>
        </Card>
      )}
    </div>
  );
}

function NumField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="col-span-2 flex flex-col text-xs text-slate-500">
      {label}
      <input
        type="number"
        step={step}
        className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-mono text-lg">{value}</div>
    </div>
  );
}
