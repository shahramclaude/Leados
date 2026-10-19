"use client";

import { useEffect, useState } from "react";
import type { FindingRow } from "@/lib/clientTypes";

type Signal = {
  finding: FindingRow;
  playbookInstances: { id: number; playbookId: number; findingId: number; status: string; playbookName: string }[];
};

const SEVERITY_COLOR: Record<string, string> = {
  low: "text-slate-400",
  medium: "text-amber-400",
  high: "text-red-400",
  critical: "text-red-300",
};

export default function SignalBoardView() {
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  function load() {
    fetch("/api/signals")
      .then((r) => r.json())
      .then((json) => setSignals(json.signals))
      .catch((e) => setError(String(e)));
  }

  useEffect(load, []);

  async function resolve(findingId: number) {
    setBusyId(findingId);
    await fetch("/api/signals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ findingId, status: "resolved" }),
    });
    setBusyId(null);
    load();
  }

  if (error) return <div className="text-sm text-red-400">Failed to load: {error}</div>;
  if (!signals) return <div className="animate-pulse text-sm text-slate-500">Loading signal board…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Signal Board</h1>
      <div className="space-y-3">
        {signals.map((s) => (
          <div key={s.finding.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-100">{s.finding.title}</p>
                <p className="mt-1 text-xs text-slate-500">{s.finding.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.finding.tags.map((t) => (
                    <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-xs font-semibold uppercase ${SEVERITY_COLOR[s.finding.severity] ?? "text-slate-400"}`}>
                  {s.finding.severity}
                </p>
                <p className="text-[10px] text-slate-500">{s.finding.domain}</p>
                <p className="mt-1 text-[10px] text-slate-500">status: {s.finding.status}</p>
                {s.finding.status === "open" && (
                  <button
                    disabled={busyId === s.finding.id}
                    onClick={() => resolve(s.finding.id)}
                    className="mt-2 rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                  >
                    Mark resolved
                  </button>
                )}
              </div>
            </div>
            {s.playbookInstances.length > 0 && (
              <div className="mt-3 border-t border-slate-800 pt-2 text-[11px] text-slate-500">
                Playbooks triggered: {s.playbookInstances.map((i) => i.playbookName).join(", ")}
              </div>
            )}
          </div>
        ))}
        {signals.length === 0 && <p className="text-sm text-slate-500">No signals yet.</p>}
      </div>
    </div>
  );
}
