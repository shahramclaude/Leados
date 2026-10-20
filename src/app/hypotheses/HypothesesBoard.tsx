"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Hypothesis {
  id: number;
  key: string;
  title: string;
  description: string | null;
  ownerName: string;
  category: string | null;
  priorProbability: number;
  currentProbability: number;
  status: string;
  resolutionDate: string | null;
}

interface Forecaster {
  ownerName: string;
  resolvedCount: number;
  brierScore: number | null;
  openCount: number;
}

export default function HypothesesBoard({ hypotheses, forecasters }: { hypotheses: Hypothesis[]; forecasters: Forecaster[] }) {
  const router = useRouter();
  const [registerForm, setRegisterForm] = useState({ key: "", title: "", ownerName: "", category: "", priorProbability: 0.5, resolutionDate: "" });
  const [evidenceForms, setEvidenceForms] = useState<Record<number, { description: string; direction: "supports" | "against"; likelihoodRatio: number }>>({});
  const [busy, setBusy] = useState(false);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/hypotheses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...registerForm, resolutionDate: registerForm.resolutionDate || undefined }),
      });
      setRegisterForm({ key: "", title: "", ownerName: "", category: "", priorProbability: 0.5, resolutionDate: "" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addEvidence(id: number) {
    const form = evidenceForms[id];
    if (!form?.description) return;
    setBusy(true);
    try {
      await fetch(`/api/hypotheses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-evidence", ...form }),
      });
      setEvidenceForms((f) => ({ ...f, [id]: { description: "", direction: "supports", likelihoodRatio: 1.5 } }));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: number, outcome: boolean) {
    setBusy(true);
    try {
      await fetch(`/api/hypotheses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", outcome }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
        <h2 className="text-lg font-semibold text-slate-950">Register a hypothesis</h2>
        <form onSubmit={register} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input required placeholder="unique key" value={registerForm.key} onChange={(e) => setRegisterForm({ ...registerForm, key: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input required placeholder="title" value={registerForm.title} onChange={(e) => setRegisterForm({ ...registerForm, title: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input required placeholder="owner" value={registerForm.ownerName} onChange={(e) => setRegisterForm({ ...registerForm, ownerName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="category" value={registerForm.category} onChange={(e) => setRegisterForm({ ...registerForm, category: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Prior probability
            <input type="number" min={0} max={1} step={0.05} value={registerForm.priorProbability} onChange={(e) => setRegisterForm({ ...registerForm, priorProbability: Number(e.target.value) })} className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <input type="date" value={registerForm.resolutionDate} onChange={(e) => setRegisterForm({ ...registerForm, resolutionDate: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={busy} type="submit" className="self-start rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-2">
            Register
          </button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
        <h2 className="text-lg font-semibold text-slate-950">Forecaster scoreboard (Brier score — lower is better)</h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="pb-2">Owner</th>
              <th className="pb-2">Resolved</th>
              <th className="pb-2">Open</th>
              <th className="pb-2">Brier score</th>
            </tr>
          </thead>
          <tbody>
            {forecasters.map((f) => (
              <tr key={f.ownerName} className="border-t border-slate-100">
                <td className="py-2 font-medium">{f.ownerName}</td>
                <td className="py-2">{f.resolvedCount}</td>
                <td className="py-2">{f.openCount}</td>
                <td className="py-2">{f.brierScore === null ? "—" : f.brierScore.toFixed(3)}</td>
              </tr>
            ))}
            {forecasters.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2 text-slate-500">
                  No forecasters yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-4">
        {hypotheses.map((h) => {
          const form = evidenceForms[h.id] ?? { description: "", direction: "supports" as const, likelihoodRatio: 1.5 };
          return (
            <div key={h.id} className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-950">{h.title}</h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-wide text-slate-600">{h.status}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                owner: {h.ownerName} {h.category ? `· ${h.category}` : ""} {h.resolutionDate ? `· resolves ${h.resolutionDate}` : ""}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-indigo-500" style={{ width: `${h.currentProbability * 100}%` }} />
                </div>
                <span className="text-sm font-semibold text-slate-950">{(h.currentProbability * 100).toFixed(0)}%</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">prior: {(h.priorProbability * 100).toFixed(0)}%</p>

              {h.status === "open" && (
                <div className="mt-4 flex flex-col gap-2 rounded-xl bg-slate-50 p-4">
                  <div className="flex flex-wrap gap-2">
                    <input
                      placeholder="evidence description"
                      value={form.description}
                      onChange={(e) => setEvidenceForms((f) => ({ ...f, [h.id]: { ...form, description: e.target.value } }))}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <select
                      value={form.direction}
                      onChange={(e) => setEvidenceForms((f) => ({ ...f, [h.id]: { ...form, direction: e.target.value as "supports" | "against" } }))}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="supports">supports</option>
                      <option value="against">against</option>
                    </select>
                    <input
                      type="number"
                      step={0.1}
                      value={form.likelihoodRatio}
                      onChange={(e) => setEvidenceForms((f) => ({ ...f, [h.id]: { ...form, likelihoodRatio: Number(e.target.value) } }))}
                      className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      title="Likelihood ratio"
                    />
                    <button disabled={busy} onClick={() => addEvidence(h.id)} className="rounded-lg bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-50">
                      Add evidence
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => resolve(h.id, true)} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                      Resolve TRUE
                    </button>
                    <button disabled={busy} onClick={() => resolve(h.id, false)} className="rounded-lg bg-rose-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                      Resolve FALSE
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {hypotheses.length === 0 && <p className="text-sm text-slate-500">No hypotheses yet.</p>}
      </section>
    </div>
  );
}
