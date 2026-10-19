"use client";

import { useEffect, useState } from "react";

interface Decision {
  id: string;
  title: string;
  status: string;
  impact: number;
  probability: string;
  deadline: string | null;
}

interface OptionValuation {
  value: number;
  theta: number;
  thetaPerDay: number;
  recommendation: "decide_now" | "wait" | "monitor";
  daysRemaining: number;
}

export default function DecisionTreesView() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [option, setOption] = useState<OptionValuation | null>(null);

  useEffect(() => {
    fetch("/api/decisions")
      .then((r) => r.json())
      .then((d) => setDecisions(d.decisions ?? []));
  }, []);

  async function inspect(id: string) {
    setSelected(id);
    const res = await fetch(`/api/decisions/${id}/option`);
    const data = await res.json();
    setOption(data.option ?? null);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-slate-950">Decision Trees</h1>
      <p className="mt-2 text-slate-600">
        Branch every open decision into "decide now" vs "wait" using the real-options model.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          {decisions.map((d) => (
            <button
              key={d.id}
              onClick={() => inspect(d.id)}
              className={`block w-full rounded-lg border px-4 py-3 text-left ${
                selected === d.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"
              }`}
            >
              <p className="font-medium">{d.title}</p>
              <p className="text-xs opacity-70">
                impact {d.impact} · status {d.status}
              </p>
            </button>
          ))}
          {decisions.length === 0 && <p className="text-slate-500">No decisions yet.</p>}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          {!option ? (
            <p className="text-slate-500">Select a decision to branch its tree.</p>
          ) : (
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-500">Option to wait</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">${option.value.toLocaleString()}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-slate-500">Theta / day</p>
                  <p className="font-medium text-slate-900">{option.thetaPerDay.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-slate-500">Days remaining</p>
                  <p className="font-medium text-slate-900">{option.daysRemaining}</p>
                </div>
              </div>
              <p className="mt-4 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700">
                Recommendation: {option.recommendation.replace("_", " ")}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
