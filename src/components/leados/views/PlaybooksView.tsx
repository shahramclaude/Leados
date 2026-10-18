"use client";

import { useCallback, useEffect, useState } from "react";
import type { useIntelligence } from "@/hooks/useIntelligence";

interface Playbook {
  id: number;
  triggeredBy: string;
  personId: number | null;
  personName: string | null;
  findingKey: string;
  status: string;
  steps: string[];
  completedSteps: number[];
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
}

export default function PlaybooksView({ intelligence }: { intelligence: ReturnType<typeof useIntelligence> }) {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [selectedFindingKey, setSelectedFindingKey] = useState("");
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/playbooks", { cache: "no-store" });
    const data: Playbook[] = await res.json();
    setPlaybooks(data);
    const drafts: Record<number, string> = {};
    data.forEach((p) => (drafts[p.id] = p.notes ?? ""));
    setNotesDraft(drafts);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const findings = intelligence.data?.findings ?? [];
  const openFindingKeys = new Set(playbooks.filter((p) => p.status === "open").map((p) => p.findingKey));
  const availableFindings = findings.filter((f) => !openFindingKeys.has(f.key));

  async function completeStep(playbook: Playbook, idx: number) {
    await fetch(`/api/playbooks/${playbook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepIndex: idx }),
    });
    await load();
    intelligence.refetch();
  }

  async function skip(playbook: Playbook) {
    await fetch(`/api/playbooks/${playbook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "skipped" }),
    });
    await load();
  }

  async function saveNotes(playbook: Playbook) {
    await fetch(`/api/playbooks/${playbook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notesDraft[playbook.id] ?? "" }),
    });
  }

  async function startPlaybook(e: React.FormEvent) {
    e.preventDefault();
    const finding = findings.find((f) => f.key === selectedFindingKey);
    if (!finding) return;
    await fetch("/api/playbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        triggeredBy: finding.rule,
        personId: finding.personId ?? null,
        findingKey: finding.key,
      }),
    });
    setSelectedFindingKey("");
    setShowStart(false);
    await load();
  }

  const open = playbooks.filter((p) => p.status === "open");
  const completed = playbooks.filter((p) => p.status !== "open");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Playbooks</h2>
          <p className="text-sm text-slate-400">Guided, step-by-step responses to findings.</p>
        </div>
        <button
          onClick={() => setShowStart((s) => !s)}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          {showStart ? "Cancel" : "+ Start playbook"}
        </button>
      </div>

      {showStart && (
        <form onSubmit={startPlaybook} className="mb-8 space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <label className="block text-xs text-slate-500">Select an active finding</label>
          <select
            value={selectedFindingKey}
            onChange={(e) => setSelectedFindingKey(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
          >
            <option value="">— choose a finding —</option>
            {availableFindings.map((f) => (
              <option key={f.key} value={f.key}>
                [{f.rule}] {f.title} (sev {f.sev})
              </option>
            ))}
          </select>
          <button
            disabled={!selectedFindingKey}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Create playbook
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Open playbooks ({open.length})
          </h3>
          <div className="mb-8 space-y-4">
            {open.length === 0 && <p className="text-sm text-slate-500">No open playbooks.</p>}
            {open.map((p) => {
              const doneCount = p.completedSteps.length;
              const total = p.steps.length || 1;
              const pct = Math.round((doneCount / total) * 100);
              return (
                <div key={p.id} className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-mono text-indigo-300">
                        {p.triggeredBy}
                      </span>
                      {p.personName && <span className="ml-2 text-xs text-slate-400">· {p.personName}</span>}
                      <p className="mt-1 font-semibold text-white">{p.findingKey}</p>
                    </div>
                    <button
                      onClick={() => skip(p)}
                      className="flex-shrink-0 rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      Skip
                    </button>
                  </div>

                  <p className="mt-3 text-xs text-slate-400">
                    {doneCount}/{p.steps.length} steps complete
                  </p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>

                  <ul className="mt-4 space-y-2">
                    {p.steps.map((step, idx) => {
                      const isDone = p.completedSteps.includes(idx);
                      const isCurrent = !isDone && idx === p.steps.findIndex((_, i) => !p.completedSteps.includes(i));
                      return (
                        <li key={idx} className="flex items-start gap-2">
                          <button
                            onClick={() => !isDone && completeStep(p, idx)}
                            className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px] ${
                              isDone
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-slate-600 text-transparent hover:border-indigo-400"
                            }`}
                          >
                            ✓
                          </button>
                          <span
                            className={`text-sm ${
                              isDone
                                ? "text-slate-500 line-through"
                                : isCurrent
                                  ? "font-semibold text-white"
                                  : "text-slate-300"
                            }`}
                          >
                            {step}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <textarea
                    value={notesDraft[p.id] ?? ""}
                    onChange={(e) => setNotesDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                    onBlur={() => saveNotes(p)}
                    placeholder="Notes…"
                    className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                    rows={2}
                  />
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setShowCompleted((s) => !s)}
            className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-300"
          >
            {showCompleted ? "▾" : "▸"} Completed / skipped ({completed.length})
          </button>
          {showCompleted && (
            <div className="space-y-2">
              {completed.map((p) => (
                <div key={p.id} className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">
                      [{p.triggeredBy}] {p.findingKey}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
                        p.status === "completed" ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                  {p.completedAt && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {p.status === "completed" ? "Completed" : "Skipped"} {new Date(p.completedAt).toLocaleString()}
                    </p>
                  )}
                  {p.notes && <p className="mt-1 text-xs text-slate-400">Notes: {p.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
