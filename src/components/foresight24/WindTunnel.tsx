import { useMemo, useState } from "react";
import { SEED_SCENARIOS } from "../../lib/scenarios/strategicScenarios";
import { normalizePlanningWeights } from "../../lib/scenarios/simulationScenario";
import { SEED_STRATEGIES } from "../../lib/windtunnel/strategyLibrary";
import { validateWeights } from "../../lib/windtunnel/robustness";
import { runWindTunnel, type WindTunnelResult } from "../../lib/windtunnel/runner";
import type { ScenarioWeight } from "../../lib/windtunnel/types";
import { PossibilityBanner } from "./PossibilityBanner";
import { Card, ConfidenceBadge, Pill, SectionHeading, StatTile } from "./ui";

const TIME_BUDGET_MS = 2000;

function utilityColor(value: number): string {
  if (value > 1.2) return "bg-emerald-200 text-emerald-900";
  if (value > 0.8) return "bg-emerald-100 text-emerald-800";
  if (value > 0.4) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

function regretColor(value: number): string {
  if (value < 0.05) return "bg-emerald-100 text-emerald-800";
  if (value < 0.2) return "bg-amber-100 text-amber-800";
  return "bg-rose-200 text-rose-900";
}

export function WindTunnel() {
  const initialWeights = useMemo(() => normalizePlanningWeights(SEED_SCENARIOS).map((s) => ({ scenarioId: s.id, weight: Number(s.planningWeight.toFixed(4)) })), []);
  const [weights, setWeights] = useState<ScenarioWeight[]>(initialWeights);
  const [ticks, setTicks] = useState(8);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WindTunnelResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validation = validateWeights(weights);

  function updateWeight(scenarioId: string, value: number) {
    setWeights((prev) => prev.map((w) => (w.scenarioId === scenarioId ? { ...w, weight: value } : w)));
  }

  function normalizeWeights() {
    const total = weights.reduce((s, w) => s + w.weight, 0) || 1;
    setWeights(weights.map((w) => ({ ...w, weight: Number((w.weight / total).toFixed(4)) })));
  }

  async function run() {
    setError(null);
    if (!validation.valid) {
      setError(`Cannot run: ${validation.reason}`);
      return;
    }
    setRunning(true);
    try {
      const r = await runWindTunnel(SEED_STRATEGIES, SEED_SCENARIOS, weights, ticks);
      setResult(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  const topStrategy = result?.rankings[0];
  const robustCount = topStrategy ? Object.values(topStrategy.utilityByScenario).filter((u) => u > 0.5).length : 0;

  return (
    <div className="space-y-6">
      <PossibilityBanner authoredAt="2026-03-06T11:00:00.000Z" authoredBy="wind-tunnel" extra="Robustness/regret rank strategies against the scenario ensemble above — they do not tell you which world will occur." />

      <Card>
        <SectionHeading title="Candidate strategies" subtitle="Each tested against every scenario in the ensemble." />
        <div className="grid gap-3 sm:grid-cols-3">
          {SEED_STRATEGIES.map((s) => (
            <div key={s.id} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                <ConfidenceBadge confidence={s.description.confidence} />
              </div>
              <p className="text-xs text-slate-600">{s.description.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeading title="Ensemble weights" subtitle="Planning weights (not probabilities) — must sum to 1 for robustness math to run." action={
          <button onClick={normalizeWeights} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Normalize to sum 1
          </button>
        } />
        <div className="grid gap-3 sm:grid-cols-5">
          {weights.map((w) => {
            const scenario = SEED_SCENARIOS.find((s) => s.id === w.scenarioId)!;
            return (
              <label key={w.scenarioId} className="text-xs">
                <span className="mb-1 block font-medium text-slate-700">{scenario.name}</span>
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={w.weight}
                  onChange={(e) => updateWeight(w.scenarioId, Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
                />
              </label>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs">
          <span className={validation.valid ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
            Sum = {validation.sum.toFixed(4)} {validation.valid ? "✓ valid" : `✗ ${validation.reason}`}
          </span>
          <label className="ml-auto flex items-center gap-2 text-slate-600">
            Ticks
            <input type="number" min={2} max={20} value={ticks} onChange={(e) => setTicks(Number(e.target.value))} className="w-16 rounded-lg border border-slate-300 px-2 py-1" />
          </label>
          <button onClick={run} disabled={running} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white shadow hover:bg-indigo-500 disabled:opacity-50">
            {running ? "Running…" : "Run wind tunnel"}
          </button>
        </div>
        {error ? <p className="mt-2 text-xs font-medium text-rose-700">{error}</p> : null}
      </Card>

      {result ? (
        <>
          <Card>
            <SectionHeading title="Run summary" subtitle={`Run at ${new Date(result.runAt).toLocaleString()}`} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Strategies" value={String(result.strategyCount)} />
              <StatTile label="Scenarios" value={String(result.scenarioCount)} />
              <StatTile label="Elapsed" value={`${result.elapsedMs.toFixed(1)}ms`} hint={`Budget: ${TIME_BUDGET_MS}ms`} />
              <StatTile label="Within budget?" value={result.elapsedMs < TIME_BUDGET_MS ? "Yes" : "No"} />
            </div>
          </Card>

          <Card>
            <SectionHeading title="Robustness ranking" subtitle="R(s) = Σ weight(scenario) × utility(strategy, scenario)" />
            <div className="space-y-2">
              {result.rankings.map((r, i) => (
                <div key={r.strategyId} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">
                      #{i + 1} {r.strategyName}
                    </span>
                    <Pill tone="indigo">Robustness {r.robustness.toFixed(3)}</Pill>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Worst case: <span className="font-medium text-slate-700">{SEED_SCENARIOS.find((s) => s.id === r.maxRegret.worstScenarioId)?.name}</span> with regret Δ {r.maxRegret.regret.toFixed(3)}
                  </div>
                </div>
              ))}
            </div>
            {topStrategy ? (
              <p className="mt-3 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">
                Recommendation framing: <strong>{topStrategy.strategyName}</strong> is robust across {robustCount}/{SEED_SCENARIOS.length} worlds (utility &gt; 0.5); worst case is{" "}
                <strong>{SEED_SCENARIOS.find((s) => s.id === topStrategy.maxRegret.worstScenarioId)?.name}</strong> with regret Δ {topStrategy.maxRegret.regret.toFixed(3)}. This ranks candidates under
                the modeled ensemble — it is not a guarantee of real-world outcomes.
              </p>
            ) : null}
          </Card>

          <Card>
            <SectionHeading title="Strategy × scenario utility matrix" />
            <Matrix result={result} colorFn={utilityColor} field="utility" />
          </Card>

          <Card>
            <SectionHeading title="Regret heat map" subtitle="Best-in-scenario utility minus this strategy's utility (always ≥ 0)." />
            <Matrix result={result} colorFn={regretColor} field="regret" />
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Matrix({ result, colorFn, field }: { result: WindTunnelResult; colorFn: (v: number) => string; field: "utility" | "regret" }) {
  const scenarioIds = Array.from(new Set(result.cells.map((c) => c.scenarioId)));
  const bestByScenario: Record<string, number> = {};
  for (const sid of scenarioIds) {
    bestByScenario[sid] = Math.max(...result.cells.filter((c) => c.scenarioId === sid).map((c) => c.utility));
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr>
            <th className="p-2 text-slate-500">Strategy \ Scenario</th>
            {scenarioIds.map((sid) => (
              <th key={sid} className="p-2 text-slate-500">
                {SEED_SCENARIOS.find((s) => s.id === sid)?.name ?? sid}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rankings.map((r) => (
            <tr key={r.strategyId}>
              <td className="p-2 font-medium text-slate-700">{r.strategyName}</td>
              {scenarioIds.map((sid) => {
                const u = r.utilityByScenario[sid] ?? 0;
                const v = field === "utility" ? u : bestByScenario[sid] - u;
                return (
                  <td key={sid} className={`p-2 text-center font-semibold ${colorFn(v)}`}>
                    {v.toFixed(3)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
