"use client";

import { useEffect, useState } from "react";

interface HypothesisRow {
  id: string;
  statement: string;
  priorProbability: string;
  posteriorProbability: string;
  status: string;
  inference?: { posterior: number; delta: number; supportingEvents: number };
}

export default function InferenceView() {
  const [hypotheses, setHypotheses] = useState<HypothesisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statement, setStatement] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/hypotheses");
    const data = await res.json();
    setHypotheses(data.hypotheses ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addHypothesis() {
    if (!statement.trim()) return;
    await fetch("/api/hypotheses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statement }),
    });
    setStatement("");
    load();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-slate-950">Inference &amp; Hypotheses</h1>
      <p className="mt-2 text-slate-600">
        Bayesian tracking of strategic hypotheses. Posteriors update automatically as new events arrive.
      </p>

      <div className="mt-6 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
          placeholder="New hypothesis statement..."
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
        />
        <button onClick={addHypothesis} className="rounded-lg bg-slate-900 px-4 py-2 text-white">
          Add
        </button>
      </div>

      {loading ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : (
        <div className="mt-6 space-y-3">
          {hypotheses.length === 0 && <p className="text-slate-500">No hypotheses tracked yet.</p>}
          {hypotheses.map((h) => (
            <div key={h.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="font-medium text-slate-900">{h.statement}</p>
              <div className="mt-2 flex items-center gap-4 text-sm text-slate-600">
                <span>Prior: {(parseFloat(h.priorProbability) * 100).toFixed(0)}%</span>
                <span>
                  Posterior: {((h.inference?.posterior ?? parseFloat(h.posteriorProbability)) * 100).toFixed(0)}%
                </span>
                <span>Evidence: {h.inference?.supportingEvents ?? 0} events</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
