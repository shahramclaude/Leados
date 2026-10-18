"use client";
import { useState } from "react";
import type { IntelligenceData } from "@/hooks/useIntelligence";

const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-slate-700 text-slate-200",
  STALE: "bg-yellow-600 text-black",
  ESCALATE: "bg-red-600 text-white",
  RESOLVED: "bg-green-600 text-white",
};
const STATUS_ORDER: Record<string, number> = { ESCALATE: 0, STALE: 1, OPEN: 2, RESOLVED: 3 };

export function DecisionsView({ data, onRefetch }: { data: IntelligenceData; onRefetch: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [domain, setDomain] = useState("gov");
  const [submitting, setSubmitting] = useState(false);

  const sorted = [...data.decisions].sort((a: any, b: any) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  async function addDecision() {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "decision", domain, data: { title, owner, openedAt: new Date().toISOString() } }),
      });
      setTitle("");
      setOwner("");
      setShowForm(false);
      onRefetch();
    } finally {
      setSubmitting(false);
    }
  }

  async function resolve(id: number) {
    await fetch(`/api/decisions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    onRefetch();
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-300">Decision tracker — {sorted.length}</div>
        <button onClick={() => setShowForm((v) => !v)} className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-1.5 text-sm text-white">
          + Add decision
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Decision title"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none"
          />
          <div className="flex gap-2">
            <input
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="Owner"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none"
            />
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none"
            >
              {["gov", "people", "finance", "sales", "ops", "strategy"].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <button
            disabled={submitting}
            onClick={addDecision}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            {submitting ? "Saving…" : "Save decision"}
          </button>
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-slate-500 border-b border-slate-800">
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Owner</th>
              <th className="px-4 py-2 font-medium">Open days</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((d: any) => (
              <tr key={d.id} className="border-b border-slate-800/60">
                <td className="px-4 py-2 text-slate-100">{d.title}</td>
                <td className="px-4 py-2 text-slate-400">{d.owner}</td>
                <td className="px-4 py-2 font-mono text-slate-400">{d.openDays}d</td>
                <td className="px-4 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_BADGE[d.status]}`}>{d.status}</span>
                </td>
                <td className="px-4 py-2 text-right">
                  {d.status !== "RESOLVED" && (
                    <button onClick={() => resolve(d.id)} className="text-xs text-indigo-400 hover:text-indigo-300">
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-600 text-sm">
                  No decisions tracked yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
