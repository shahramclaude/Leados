"use client";

import { useState } from "react";
import type { ChangeProgram, Intervention } from "@/lib/change/types";

interface Props {
  programs: ChangeProgram[];
  initialInterventions: Intervention[];
}

interface RunResult {
  interventionId: string;
  estimate: number;
  ci95: [number, number];
  language: string;
  expectedEffect: number;
  surprise: number;
  withinExpectedBounds: boolean;
  excludedGroups: string[];
  error?: string;
}

export function InterventionLabClient({ programs, initialInterventions }: Props) {
  const [interventions, setInterventions] = useState<Intervention[]>(initialInterventions);
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [kind, setKind] = useState("");
  const [cost, setCost] = useState(0);
  const [expectedEffectValue, setExpectedEffectValue] = useState(0.1);
  const [designIdentification, setDesignIdentification] = useState<"randomized_clean" | "observational">("randomized_clean");
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eligiblePrograms = programs.filter((p) => p.affectedGroups.length >= 2);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/change/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId, kind, cost, expectedEffectValue, designIdentification }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "failed to create intervention");
        return;
      }
      setInterventions((prev) => [data.intervention, ...prev]);
      setKind("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create intervention");
    } finally {
      setCreating(false);
    }
  }

  async function handleRunEstimate(interventionId: string) {
    setRunningId(interventionId);
    try {
      const res = await fetch(`/api/change/interventions/${interventionId}/result`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setResults((prev) => ({ ...prev, [interventionId]: { interventionId, error: data.error } as RunResult }));
        return;
      }
      setResults((prev) => ({
        ...prev,
        [interventionId]: {
          interventionId,
          estimate: data.estimated.value.estimate,
          ci95: data.estimated.value.ci95,
          language: data.estimated.value.language,
          expectedEffect: data.record.expectedEffect,
          surprise: data.record.surprise,
          withinExpectedBounds: data.record.withinExpectedBounds,
          excludedGroups: data.excludedGroups ?? [],
        },
      }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [interventionId]: { interventionId, error: err instanceof Error ? err.message : "failed" } as RunResult,
      }));
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="m-0 text-sm font-semibold uppercase tracking-wide text-slate-500">Design a rollout</h3>
        <form onSubmit={handleCreate} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Program
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {eligiblePrograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.intent}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Intervention kind
            <input
              required
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              placeholder="e.g. Pairing-session blitz"
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Cost (USD)
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Expected effect (adoption-rate lift, e.g. 0.1 = +10pp)
            <input
              type="number"
              step="0.01"
              value={expectedEffectValue}
              onChange={(e) => setExpectedEffectValue(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Design identification
            <select
              value={designIdentification}
              onChange={(e) => setDesignIdentification(e.target.value as "randomized_clean" | "observational")}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="randomized_clean">Randomized (stepped-wedge, clean)</option>
              <option value="observational">Observational</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={creating || !programId}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create intervention"}
            </button>
          </div>
        </form>
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        {eligiblePrograms.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">No program has 2+ affected groups yet — stepped-wedge design needs at least 2.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="m-0 text-sm font-semibold uppercase tracking-wide text-slate-500">Interventions &amp; results</h3>
        {interventions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No interventions yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {interventions.map((iv) => {
              const result = results[iv.id];
              return (
                <li key={iv.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="m-0 font-medium text-slate-900">{iv.kind}</p>
                      <p className="m-0 text-xs text-slate-500">
                        Program: {iv.programId} · Expected effect {iv.expectedEffect.value > 0 ? "+" : ""}
                        {iv.expectedEffect.value} · status {iv.status}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRunEstimate(iv.id)}
                      disabled={runningId === iv.id}
                      className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                    >
                      {runningId === iv.id ? "Estimating…" : "Run estimate"}
                    </button>
                  </div>

                  {result && !result.error && (
                    <div className="mt-3 rounded-lg bg-white p-3 text-sm">
                      <p className="m-0 text-slate-800">{result.language}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Estimate: <span className="font-semibold">{result.estimate}</span> (95% CI {result.ci95[0]} to{" "}
                        {result.ci95[1]}) vs expected <span className="font-semibold">{result.expectedEffect}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Surprise: {result.surprise} —{" "}
                        <span className={result.withinExpectedBounds ? "text-emerald-600" : "text-amber-600"}>
                          {result.withinExpectedBounds ? "within expected bounds" : "outside expected bounds"}
                        </span>
                      </p>
                      {result.excludedGroups.length > 0 && (
                        <p className="mt-1 text-xs italic text-slate-400">
                          Excluded from estimate (below k-anonymity threshold): {result.excludedGroups.join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                  {result?.error && <p className="mt-2 text-xs text-rose-600">{result.error}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
