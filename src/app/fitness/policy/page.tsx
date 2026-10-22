"use client";

import { useCallback, useEffect, useState } from "react";
import { DIMENSIONS } from "@/lib/fitness/dimensions";

interface Policy {
  id: number;
  version: number;
  name: string;
  rationale: string;
  weights: Record<string, { weight: number; rationale: string }>;
  status: string;
  activatedAt: string | null;
}

interface SimPoint {
  periodEnd: string;
  originalFitness: number;
  simulatedFitness: number;
  delta: number;
}

interface SimResult {
  points: SimPoint[];
  originalTrendSlope: number;
  simulatedTrendSlope: number;
  trendFlips: boolean;
  summary: string;
}

function emptyWeights() {
  const w: Record<string, { weight: number; rationale: string }> = {};
  for (const d of DIMENSIONS) w[d.id] = { weight: d.defaultWeight, rationale: "" };
  return w;
}

export default function WeightPolicyPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [name, setName] = useState("");
  const [rationale, setRationale] = useState("");
  const [weights, setWeights] = useState(emptyWeights());
  const [sim, setSim] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/fitness/policies").then((r) => r.json());
    if (res.ok) setPolicies(res.policies);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runSimulation() {
    setBusy(true);
    try {
      const res = await fetch("/api/fitness/policies/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights }),
      }).then((r) => r.json());
      if (res.ok) setSim(res.simulation);
      else alert(res.error);
    } finally {
      setBusy(false);
    }
  }

  async function createDraft() {
    if (!name || !rationale) {
      alert("Policy name and overall rationale are required.");
      return;
    }
    const missingRationale = DIMENSIONS.filter((d) => !weights[d.id].rationale);
    if (missingRationale.length > 0) {
      alert(`Per-dimension rationale required for: ${missingRationale.map((d) => d.id).join(", ")}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/fitness/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rationale, weights }),
      }).then((r) => r.json());
      if (!res.ok) alert(res.error);
      else {
        setName("");
        setRationale("");
        setWeights(emptyWeights());
        setSim(null);
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function activate(id: number) {
    if (!confirm("Activate this policy? The previously active policy will be archived.")) return;
    await fetch(`/api/fitness/policies/${id}/activate`, { method: "POST" });
    load();
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">Propose a new weight policy</h2>
        <p className="text-sm text-slate-500">
          Weights are org policy, not engineering constants. Every dimension requires its own rationale. Simulate against
          history before you can meaningfully decide whether to activate.
        </p>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <input
            placeholder="Policy name (e.g. 'FY26 Q1 rebalance — people focus')"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm md:col-span-2"
          />
          <textarea
            placeholder="Overall rationale for this policy change"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm md:col-span-2"
            rows={2}
          />
        </div>

        <div className="mt-4 space-y-2">
          {DIMENSIONS.map((d) => (
            <div key={d.id} className="grid grid-cols-12 items-center gap-2 text-sm">
              <label className="col-span-3 font-medium text-slate-700">{d.name}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={weights[d.id].weight}
                onChange={(e) =>
                  setWeights({ ...weights, [d.id]: { ...weights[d.id], weight: Number(e.target.value) } })
                }
                className="col-span-2 rounded border border-slate-300 px-2 py-1"
              />
              <input
                placeholder="Rationale for this weight (required)"
                value={weights[d.id].rationale}
                onChange={(e) => setWeights({ ...weights, [d.id]: { ...weights[d.id], rationale: e.target.value } })}
                className="col-span-7 rounded border border-slate-300 px-2 py-1"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={runSimulation}
            disabled={busy}
            className="rounded border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            Simulate against historical trend
          </button>
          <button
            onClick={createDraft}
            disabled={busy}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Save as draft policy
          </button>
        </div>

        {sim && (
          <div
            className={`mt-4 rounded-xl border p-4 text-sm ${
              sim.trendFlips ? "border-rose-400 bg-rose-50 text-rose-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"
            }`}
          >
            <p className="font-semibold">{sim.trendFlips ? "⚠ Trend would flip" : "✓ Trend direction preserved"}</p>
            <p className="mt-1">{sim.summary}</p>
            <div className="mt-3 flex items-end gap-1">
              {sim.points.map((p) => (
                <div key={p.periodEnd} className="flex flex-col items-center gap-1">
                  <div className="flex items-end gap-0.5">
                    <div
                      title={`original ${p.originalFitness.toFixed(3)}`}
                      className="w-3 rounded-t bg-slate-400"
                      style={{ height: `${Math.max(2, p.originalFitness * 60)}px` }}
                    />
                    <div
                      title={`simulated ${p.simulatedFitness.toFixed(3)}`}
                      className="w-3 rounded-t bg-indigo-500"
                      style={{ height: `${Math.max(2, p.simulatedFitness * 60)}px` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400">{p.periodEnd.slice(5)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">grey = original policy · indigo = proposed weights, same raw metrics</p>
            {sim.trendFlips && (
              <p className="mt-2 font-semibold">
                This weight change would have flipped last quarter&apos;s trend — proceed only with explicit leadership sign-off.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">Policy history</h2>
        <div className="mt-3 space-y-3">
          {policies.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">
                  v{p.version} — {p.name}{" "}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
                      p.status === "active"
                        ? "bg-emerald-100 text-emerald-700"
                        : p.status === "draft"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {p.status}
                  </span>
                </p>
                {p.status === "draft" && (
                  <button
                    onClick={() => activate(p.id)}
                    className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Activate
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-600">{p.rationale}</p>
              <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-500 md:grid-cols-4">
                {Object.entries(p.weights).map(([dimId, w]) => (
                  <span key={dimId}>
                    <span className="font-mono">{dimId}</span>: {w.weight}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {policies.length === 0 && <p className="text-sm text-slate-400">No policies yet — seed demo data from the Dashboard.</p>}
        </div>
      </section>
    </div>
  );
}
