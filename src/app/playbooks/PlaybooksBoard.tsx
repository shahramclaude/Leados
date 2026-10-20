"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Step {
  order: number;
  title: string;
  description?: string;
  owner?: string;
}

interface Playbook {
  id: number;
  key: string;
  title: string;
  description: string | null;
  status: string;
  version: number;
  steps: Step[];
  effectiveness: {
    totalRuns: number;
    completedRuns: number;
    completionRate: number;
    avgOutcomeDelta: number | null;
    automationShare: number;
  };
}

interface Candidate {
  id: number;
  suggestedTitle: string;
  rationale: string;
  status: string;
  suggestedSteps: Step[];
}

export default function PlaybooksBoard({ playbooks, candidates }: { playbooks: Playbook[]; candidates: Candidate[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [acceptKeys, setAcceptKeys] = useState<Record<number, string>>({});

  async function invoke(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/playbooks/${id}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invokedBy: "ui-user", invokedVia: "human" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function mineCandidates() {
    setBusy(true);
    try {
      await fetch("/api/playbooks/candidates", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function accept(id: number) {
    const key = acceptKeys[id] || `playbook:candidate-${id}`;
    setBusy(true);
    try {
      await fetch(`/api/playbooks/candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept", key }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/playbooks/candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        {playbooks.map((p) => (
          <div key={p.id} className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-950">{p.title}</h3>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-wide text-slate-600">{p.status}</span>
                <span className="text-xs text-slate-500">v{p.version}</span>
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-600">{p.description}</p>
            <ol className="mt-3 list-decimal pl-5 text-sm text-slate-700">
              {p.steps.map((s) => (
                <li key={s.order}>
                  {s.title} {s.owner ? <span className="text-xs text-slate-500">({s.owner})</span> : null}
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
              <span>Runs: {p.effectiveness.totalRuns}</span>
              <span>Completion rate: {(p.effectiveness.completionRate * 100).toFixed(0)}%</span>
              <span>Avg outcome delta: {p.effectiveness.avgOutcomeDelta === null ? "—" : p.effectiveness.avgOutcomeDelta.toFixed(2)}</span>
              <span>Automation share: {(p.effectiveness.automationShare * 100).toFixed(0)}%</span>
            </div>
            <button disabled={busy || p.status === "deprecated"} onClick={() => invoke(p.id)} className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Invoke playbook
            </button>
          </div>
        ))}
        {playbooks.length === 0 && <p className="text-sm text-slate-500">No playbooks yet.</p>}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-950">Mined playbook candidates (suggest-only)</h2>
          <button disabled={busy} onClick={mineCandidates} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Re-mine from retrospectives
          </button>
        </div>
        <ul className="mt-4 flex flex-col gap-3">
          {candidates.map((c) => (
            <li key={c.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-medium text-slate-950">{c.suggestedTitle}</h4>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs uppercase">{c.status}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{c.rationale}</p>
              {c.status === "suggested" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    placeholder="playbook key"
                    value={acceptKeys[c.id] ?? ""}
                    onChange={(e) => setAcceptKeys((k) => ({ ...k, [c.id]: e.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button disabled={busy} onClick={() => accept(c.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                    Accept → create playbook
                  </button>
                  <button disabled={busy} onClick={() => reject(c.id)} className="rounded-lg bg-rose-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
          {candidates.length === 0 && <li className="text-sm text-slate-500">No mined candidates yet.</li>}
        </ul>
      </section>
    </div>
  );
}
