"use client";

import { useState } from "react";
import { EvidenceChip } from "@/components/EvidenceChip";
import { IntervalBar } from "@/components/IntervalBar";

interface Scenario {
  id: number;
  name: string;
  type: string;
  description: string;
  defaultParams: { baseProbabilityMultiplier: number; correlatedShockFactor: number; trials: number };
}

interface RunResult {
  run: {
    id: number;
    systemicExposureScore: number;
    intervalLow: number;
    intervalHigh: number;
    sensitivity: Array<{ parameter: string; delta: number; exposureDelta: number }>;
    affectedNodeFrequency: Record<string, number>;
    twinValidated: boolean;
    ensembleReconciled: boolean;
    evidenceClass: "model_estimate";
  };
  caveats: string[];
}

export function ContagionSimulator({ scenarios }: { scenarios: Scenario[] }) {
  const [scenarioId, setScenarioId] = useState<number>(scenarios[0]?.id ?? 0);
  const activeScenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];

  const [baseProbabilityMultiplier, setBaseProbabilityMultiplier] = useState(
    activeScenario?.defaultParams.baseProbabilityMultiplier ?? 1,
  );
  const [correlatedShockFactor, setCorrelatedShockFactor] = useState(
    activeScenario?.defaultParams.correlatedShockFactor ?? 0.2,
  );
  const [trials, setTrials] = useState(activeScenario?.defaultParams.trials ?? 500);
  const [seed, setSeed] = useState(42);
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onScenarioChange(id: number) {
    setScenarioId(id);
    const s = scenarios.find((sc) => sc.id === id);
    if (s) {
      setBaseProbabilityMultiplier(s.defaultParams.baseProbabilityMultiplier);
      setCorrelatedShockFactor(s.defaultParams.correlatedShockFactor);
      setTrials(s.defaultParams.trials);
    }
    setResult(null);
  }

  async function runSimulation() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contagion/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, baseProbabilityMultiplier, correlatedShockFactor, trials, seed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as RunResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <label className="block text-sm font-medium text-slate-700">Stress scenario</label>
        <select
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={scenarioId}
          onChange={(e) => onScenarioChange(Number(e.target.value))}
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {activeScenario ? <p className="mt-2 text-sm text-slate-500">{activeScenario.description}</p> : null}

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <SliderField
            label={`Base propagation multiplier: ${baseProbabilityMultiplier.toFixed(2)}`}
            value={baseProbabilityMultiplier}
            min={0}
            max={2}
            step={0.05}
            onChange={setBaseProbabilityMultiplier}
          />
          <SliderField
            label={`Correlated-shock factor: ${correlatedShockFactor.toFixed(2)}`}
            value={correlatedShockFactor}
            min={0}
            max={1}
            step={0.05}
            onChange={setCorrelatedShockFactor}
          />
          <SliderField
            label={`Monte Carlo trials: ${trials}`}
            value={trials}
            min={50}
            max={2000}
            step={50}
            onChange={(v) => setTrials(Math.round(v))}
          />
          <SliderField label={`Random seed: ${seed}`} value={seed} min={1} max={999} step={1} onChange={(v) => setSeed(Math.round(v))} />
        </div>

        <button
          onClick={runSimulation}
          disabled={loading || !activeScenario}
          className="mt-5 rounded-full bg-violet-700 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
        >
          {loading ? "Running cascade..." : "Run cascade simulation"}
        </button>
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
      </div>

      {result ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-950">Systemic exposure estimate</h3>
            <EvidenceChip evidenceClass={result.run.evidenceClass} sourceRef={`contagion run #${result.run.id}`} />
          </div>

          <div className="mt-4">
            <IntervalBar
              low={result.run.intervalLow}
              mean={result.run.systemicExposureScore}
              high={result.run.intervalHigh}
              label="Revenue-weighted fraction of network affected (p10 – mean – p90 across trials)"
            />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Parameter sensitivity</h4>
              <p className="text-xs text-slate-500">
                Effect of a +10% change in each parameter on mean exposure, same seed — reported on every run.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {result.run.sensitivity.map((s) => (
                  <li key={s.parameter} className="flex justify-between border-b border-slate-100 py-1">
                    <span className="text-slate-600">{s.parameter}</span>
                    <span className={s.exposureDelta >= 0 ? "text-rose-600" : "text-emerald-600"}>
                      {s.exposureDelta >= 0 ? "+" : ""}
                      {(s.exposureDelta * 100).toFixed(2)} pts
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Validation status</h4>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                <li>Digital twin validated: {result.run.twinValidated ? "yes" : "no (seam not integrated)"}</li>
                <li>Scenario ensemble reconciled: {result.run.ensembleReconciled ? "yes" : "no (seam not integrated)"}</li>
              </ul>
            </div>
          </div>

          <div className="mt-5">
            <h4 className="text-sm font-semibold text-slate-800">Node-level affected frequency (top 10)</h4>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {Object.entries(result.run.affectedNodeFrequency)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([nodeId, freq]) => (
                  <li key={nodeId} className="flex justify-between text-sm text-slate-600">
                    <span>node #{nodeId}</span>
                    <span>{(freq * 100).toFixed(0)}%</span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">Honesty caveats</p>
            <ul className="mt-1 list-disc pl-5">
              {result.caveats.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-violet-700"
      />
    </div>
  );
}
