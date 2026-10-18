"use client";

import { useState } from "react";
import type { DecisionView as Decision, IntelligenceData } from "@/lib/intelligence";
import { DOMAINS, type Domain } from "@/lib/domains";

const DOMAIN_COLOR: Record<string, string> = {
  people: "bg-blue-400",
  finance: "bg-emerald-400",
  sales: "bg-orange-400",
  ops: "bg-purple-400",
  strategy: "bg-cyan-400",
  gov: "bg-pink-400",
};

const STATUS_ORDER: Record<Decision["status"], number> = { ESCALATE: 0, STALE: 1, OPEN: 2, RESOLVED: 3 };

function StatusBadge({ status }: { status: Decision["status"] }) {
  if (status === "ESCALATE")
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-red-700/50 bg-red-600/20 px-2 py-0.5 text-xs text-red-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Escalate
      </span>
    );
  if (status === "STALE")
    return <span className="rounded-full border border-amber-700/50 bg-amber-600/20 px-2 py-0.5 text-xs text-amber-400">Stale</span>;
  if (status === "RESOLVED")
    return <span className="rounded-full border border-green-700/50 bg-green-600/20 px-2 py-0.5 text-xs text-green-400">Done</span>;
  return <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400">Open</span>;
}

function openDaysColor(days: number) {
  if (days > 45) return "text-red-400";
  if (days > 21) return "text-amber-400";
  return "text-slate-300";
}

export function DecisionsView({ data, refetch }: { data: IntelligenceData; refetch: () => Promise<void> }) {
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [domain, setDomain] = useState<Domain>("people");
  const [loading, setLoading] = useState(false);

  const sorted = [...data.decisions].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  async function submit() {
    if (!title || !owner) return;
    setLoading(true);
    try {
      await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, owner, domain }),
      });
      setShowModal(false);
      setTitle("");
      setOwner("");
      await refetch();
    } finally {
      setLoading(false);
    }
  }

  async function resolve(id: number) {
    await fetch(`/api/decisions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    refetch();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-100">Decisions</h2>
        <button onClick={() => setShowModal(true)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">
          Add Decision
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Domain</th>
              <th className="px-3 py-2">Open days</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => (
              <tr key={d.id} className="border-t border-slate-800">
                <td className="px-3 py-2">
                  <StatusBadge status={d.status} />
                </td>
                <td className="px-3 py-2 text-slate-200">{d.title}</td>
                <td className="px-3 py-2 text-slate-400">{d.owner}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${DOMAIN_COLOR[d.domain]}`} /> {d.domain}
                  </span>
                </td>
                <td className={`px-3 py-2 font-mono ${openDaysColor(d.openDays)}`}>{d.openDays}d</td>
                <td className="px-3 py-2">
                  {d.status !== "RESOLVED" && (
                    <button
                      onClick={() => resolve(d.id)}
                      className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-600"
                    >
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No decisions logged.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-slate-100">Add Decision</h3>
            <div className="space-y-3">
              <label className="block text-sm text-slate-400">
                Title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                />
              </label>
              <label className="block text-sm text-slate-400">
                Owner
                <input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                />
              </label>
              <label className="block text-sm text-slate-400">
                Domain
                <select
                  value={domain}
                  onChange={(e) => setDomain(e.target.value as Domain)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                >
                  {DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={loading}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {loading ? "Saving…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
