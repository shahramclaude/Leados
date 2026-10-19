"use client";

import { useEffect, useState } from "react";
import type { HypothesisRow } from "@/lib/clientTypes";

function daysRemaining(resolveBy: string): number {
  const ms = new Date(resolveBy).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function rowTone(h: HypothesisRow): string {
  const remaining = daysRemaining(h.resolveBy);
  if (h.status === "confirmed") return "text-emerald-400";
  if (h.status === "refuted") return "text-slate-600";
  if (h.status === "open" && remaining < 0) return "text-red-400";
  return "text-slate-200";
}

export default function HypothesesView() {
  const [hypotheses, setHypotheses] = useState<HypothesisRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/hypothesis")
      .then((r) => r.json())
      .then((json) => setHypotheses(json.hypotheses))
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-sm text-red-400">Failed to load: {error}</div>;
  if (!hypotheses) return <div className="animate-pulse text-sm text-slate-500">Loading hypotheses…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Hypotheses</h1>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900 text-slate-500">
            <tr>
              <th className="px-3 py-2">Hypothesis</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Claim</th>
              <th className="px-3 py-2">Resolve By</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Days Remaining</th>
              <th className="px-3 py-2">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {hypotheses.map((h) => {
              const remaining = daysRemaining(h.resolveBy);
              const tone = rowTone(h);
              return (
                <tr key={h.id} className="border-t border-slate-800">
                  <td className={`px-3 py-1.5 font-medium ${tone}`}>#{h.id}</td>
                  <td className="px-3 py-1.5 text-slate-300">{h.entity}</td>
                  <td className="px-3 py-1.5 text-slate-400">{h.claim}</td>
                  <td className="px-3 py-1.5 text-slate-500">{new Date(h.resolveBy).toLocaleDateString()}</td>
                  <td className={`px-3 py-1.5 uppercase ${tone}`}>{h.status}</td>
                  <td className={`px-3 py-1.5 ${remaining < 0 && h.status === "open" ? "text-red-400" : "text-slate-400"}`}>
                    {remaining}
                  </td>
                  <td className="px-3 py-1.5 text-slate-400">{Math.round(h.confidence * 100)}%</td>
                </tr>
              );
            })}
            {hypotheses.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                  No open hypotheses.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
