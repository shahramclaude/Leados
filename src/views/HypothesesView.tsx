"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/AppContext";
import { useNowTick } from "@/lib/useNowTick";
import { DOMAIN_META, timeUntil } from "@/lib/domains";
import type { Hypothesis } from "@/lib/types";

const STATUS_COLOR: Record<Hypothesis["status"], string> = {
  open: "var(--accent-indigo-400)",
  confirmed: "var(--good)",
  refuted: "var(--sev-5)",
};

export default function HypothesesView() {
  const { orchestratorResult, openSidePanel, agentStatus } = useApp();
  const now = useNowTick();
  const [filter, setFilter] = useState<"all" | Hypothesis["status"]>("all");

  const hypotheses = useMemo(() => {
    if (!orchestratorResult) return [];
    return orchestratorResult.hypotheses.filter((h) => filter === "all" || h.status === filter);
  }, [orchestratorResult, filter]);

  if (!orchestratorResult) {
    return <div className="p-4 font-mono text-xs text-slate-500">LOADING…</div>;
  }

  const accuracy =
    agentStatus && agentStatus.hypothesesConfirmed + agentStatus.hypothesesRefuted > 0
      ? Math.round((agentStatus.hypothesesConfirmed / (agentStatus.hypothesesConfirmed + agentStatus.hypothesesRefuted)) * 100)
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <header className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xl text-indigo-400">⍺</span>
          <h1 className="text-lg font-semibold text-slate-100">Hypothesis Testing</h1>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Every hypothesis the system is actively testing against incoming evidence, with resolution state and
          confidence.
        </p>
        {accuracy != null && (
          <div className="mt-2 font-mono text-[10px] text-slate-400">
            HISTORICAL ACCURACY: <span className="text-emerald-400">{accuracy}%</span> ({agentStatus?.hypothesesConfirmed} confirmed /{" "}
            {agentStatus?.hypothesesRefuted} refuted)
          </div>
        )}
      </header>

      <div className="flex gap-2">
        {(["all", "open", "confirmed", "refuted"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`min-h-9 rounded px-3 py-1.5 font-mono text-[10px] tracking-wider ${
              filter === s ? "bg-indigo-700 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {hypotheses.length === 0 ? (
          <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-4 text-center font-mono text-xs text-slate-500">
            NO HYPOTHESES IN THIS STATE
          </div>
        ) : (
          hypotheses.map((h) => (
            <button
              key={h.id}
              onClick={() => openSidePanel("hypothesis", h.id)}
              className="block w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-raised)] p-3 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DOMAIN_META[h.domain].color }} />
                  <span className="text-sm text-slate-100">{h.title}</span>
                </div>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold text-black"
                  style={{ backgroundColor: STATUS_COLOR[h.status] }}
                >
                  {h.status.toUpperCase()}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-1.5 w-32 overflow-hidden rounded bg-slate-800">
                  <div className="h-full bg-indigo-500" style={{ width: `${h.confidence * 100}%` }} />
                </div>
                <span className="font-mono text-[9px] text-slate-500">{Math.round(h.confidence * 100)}% confidence</span>
                <span className="font-mono text-[9px] text-slate-500">
                  {h.resolvesAt ? `resolves ${timeUntil(h.resolvesAt, now)}` : ""}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
