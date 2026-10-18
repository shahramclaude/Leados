"use client";
import { useEffect, useState, useCallback } from "react";
import type { IntelligenceData } from "@/hooks/useIntelligence";

interface Hypothesis {
  id: number;
  statement: string;
  prediction: string;
  testMetric: string;
  windowDays: number;
  status: string;
  confidence: number;
  createdAt: string;
}

function daysRemaining(h: Hypothesis) {
  const created = new Date(h.createdAt).getTime();
  const deadline = created + h.windowDays * 24 * 60 * 60 * 1000;
  return Math.ceil((deadline - Date.now()) / (24 * 60 * 60 * 1000));
}

export function HypothesesView({ onRefetch }: { data: IntelligenceData; onRefetch: () => void }) {
  const [items, setItems] = useState<Hypothesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [statement, setStatement] = useState("");
  const [prediction, setPrediction] = useState("");
  const [testMetric, setTestMetric] = useState("");
  const [windowDays, setWindowDays] = useState(14);

  const load = useCallback(async () => {
    const res = await fetch("/api/hypotheses");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (!statement.trim()) return;
    await fetch("/api/hypotheses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statement, prediction, testMetric, windowDays }),
    });
    setStatement("");
    setPrediction("");
    setTestMetric("");
    setWindowDays(14);
    setShowForm(false);
    load();
    onRefetch();
  }

  const open = items.filter((h) => h.status === "open" && daysRemaining(h) > 0);
  const awaiting = items.filter((h) => h.status === "open" && daysRemaining(h) <= 0);
  const resolved = items.filter((h) => h.status !== "open");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-300">Hypothesis tracker</div>
        <button onClick={() => setShowForm((v) => !v)} className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-1.5 text-sm text-white">
          + New hypothesis
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
          <input
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="Statement"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none"
          />
          <input
            value={prediction}
            onChange={(e) => setPrediction(e.target.value)}
            placeholder="Prediction"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none"
          />
          <div className="flex gap-2">
            <input
              value={testMetric}
              onChange={(e) => setTestMetric(e.target.value)}
              placeholder="Test metric"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none"
            />
            <input
              type="number"
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              placeholder="Window days"
              className="w-32 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none"
            />
          </div>
          <button onClick={submit} className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-1.5 text-sm text-white">
            Save
          </button>
        </div>
      )}

      {loading && <div className="text-sm text-slate-500">Loading hypotheses…</div>}

      <div>
        <div className="text-xs uppercase text-slate-500 mb-2">Open — {open.length}</div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2 font-medium">Statement</th>
                <th className="px-4 py-2 font-medium">Test metric</th>
                <th className="px-4 py-2 font-medium">Days left</th>
                <th className="px-4 py-2 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {open.map((h) => (
                <tr key={h.id} className="border-b border-slate-800/60">
                  <td className="px-4 py-2 text-slate-100">{h.statement}</td>
                  <td className="px-4 py-2 font-mono text-slate-500 text-xs">{h.testMetric}</td>
                  <td className="px-4 py-2 font-mono text-slate-400">{daysRemaining(h)}d</td>
                  <td className="px-4 py-2 font-mono text-slate-400">{h.confidence}%</td>
                </tr>
              ))}
              {open.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-slate-600 text-xs">
                    No open hypotheses.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {awaiting.length > 0 && (
        <div>
          <div className="text-xs uppercase text-amber-400 mb-2">Awaiting result — {awaiting.length}</div>
          <div className="space-y-2">
            {awaiting.map((h) => (
              <div key={h.id} className="bg-amber-950/20 border border-amber-800/40 rounded-xl px-4 py-3 text-sm text-amber-200">
                {h.statement} — test window closed {Math.abs(daysRemaining(h))}d ago.
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3">
        <summary className="cursor-pointer text-xs text-slate-400">Resolved ({resolved.length})</summary>
        <div className="space-y-2 mt-3">
          {resolved.map((h) => (
            <div key={h.id} className="flex items-center justify-between text-xs border-b border-slate-800/60 py-1.5">
              <span className="text-slate-400">{h.statement}</span>
              <span className={h.status === "confirmed" ? "text-emerald-400" : "text-red-400"}>{h.status}</span>
            </div>
          ))}
          {resolved.length === 0 && <div className="text-xs text-slate-600">Nothing resolved yet.</div>}
        </div>
      </details>
    </div>
  );
}
