"use client";

import { useCallback, useEffect, useState } from "react";

interface Hypothesis {
  id: number;
  statement: string;
  prediction: string;
  testMetric: string;
  windowDays: number;
  confidence: number;
  status: "open" | "confirmed" | "refuted";
  createdAt: string;
}

function daysRemaining(h: Hypothesis) {
  const created = new Date(h.createdAt).getTime();
  const deadline = created + h.windowDays * 24 * 60 * 60 * 1000;
  return Math.ceil((deadline - Date.now()) / (24 * 60 * 60 * 1000));
}

export function HypothesesView() {
  const [items, setItems] = useState<Hypothesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [statement, setStatement] = useState("");
  const [prediction, setPrediction] = useState("");
  const [testMetric, setTestMetric] = useState("");
  const [windowDays, setWindowDays] = useState(14);
  const [confidence, setConfidence] = useState(50);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/hypotheses", { cache: "no-store" });
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: number, status: "confirmed" | "refuted") {
    await fetch(`/api/hypotheses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function submit() {
    if (!statement || !prediction || !testMetric) return;
    setSubmitting(true);
    try {
      await fetch("/api/hypotheses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement, prediction, testMetric, windowDays, confidence }),
      });
      setStatement("");
      setPrediction("");
      setTestMetric("");
      setWindowDays(14);
      setConfidence(50);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  const open = items.filter((h) => h.status === "open");
  const confirmed = items.filter((h) => h.status === "confirmed");
  const refuted = items.filter((h) => h.status === "refuted");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-slate-100">Hypothesis Tracker</h2>

      {loading && <div className="text-slate-500">Loading…</div>}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-300">Open ({open.length})</h3>
        <div className="space-y-2">
          {open.map((h) => {
            const remaining = daysRemaining(h);
            return (
              <div key={h.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm text-slate-200">{h.statement}</div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${remaining < 3 ? "bg-amber-600/20 text-amber-400" : "bg-slate-800 text-slate-500"}`}>
                    {remaining}d left
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Predicts: {h.prediction} · Metric: {h.testMetric} · Window {h.windowDays}d
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${h.confidence}%` }} />
                </div>
                <div className="mt-1 text-xs text-slate-500">Confidence: {h.confidence}%</div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setStatus(h.id, "confirmed")} className="rounded-lg bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-500">
                    Confirmed ✓
                  </button>
                  <button onClick={() => setStatus(h.id, "refuted")} className="rounded-lg bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-500">
                    Refuted ✗
                  </button>
                </div>
              </div>
            );
          })}
          {open.length === 0 && !loading && <div className="text-sm text-slate-600">No open hypotheses.</div>}
        </div>
      </div>

      {confirmed.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-green-400">Confirmed</h3>
          <div className="space-y-2">
            {confirmed.map((h) => (
              <div key={h.id} className="rounded-xl border border-green-700/40 bg-green-950/10 p-3 text-sm text-slate-300">
                {h.statement}
              </div>
            ))}
          </div>
        </div>
      )}

      {refuted.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-red-400">Refuted</h3>
          <div className="space-y-2">
            {refuted.map((h) => (
              <div key={h.id} className="rounded-xl border border-red-700/40 bg-red-950/10 p-3 text-sm text-slate-500 opacity-70">
                {h.statement}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">New hypothesis</h3>
        <div className="space-y-3">
          <textarea
            placeholder="Statement"
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
            rows={2}
          />
          <input
            placeholder="Prediction"
            value={prediction}
            onChange={(e) => setPrediction(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
          />
          <input
            placeholder="Test metric"
            value={testMetric}
            onChange={(e) => setTestMetric(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
          />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-400">
              Window days
              <input
                type="number"
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
                className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200"
              />
            </label>
            <label className="flex flex-1 items-center gap-2 text-sm text-slate-400">
              Confidence
              <input
                type="range"
                min={0}
                max={100}
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="flex-1"
              />
              <span className="font-mono text-slate-300">{confidence}%</span>
            </label>
          </div>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Create hypothesis"}
          </button>
        </div>
      </div>
    </div>
  );
}
