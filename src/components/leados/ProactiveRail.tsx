"use client";

import { useState } from "react";
import type { IntelligenceData } from "@/lib/intelligence";
import type { ViewKey } from "@/components/leados/Shell";

const URGENCY_COLOR: Record<string, string> = {
  NOW: "bg-red-600/20 text-red-400 border-red-700/50",
  TODAY: "bg-amber-600/20 text-amber-400 border-amber-700/50",
  THIS_WEEK: "bg-yellow-600/20 text-yellow-400 border-yellow-700/50",
  MONITOR: "bg-slate-700/40 text-slate-400 border-slate-700",
};

const RISK_COLOR: Record<string, string> = {
  HIGH: "text-red-400",
  ELEVATED: "text-amber-400",
  LOW: "text-green-400",
};

export function ProactiveRail({
  data,
  navigate,
  refetch,
}: {
  data: IntelligenceData;
  navigate: (v: ViewKey, personId?: number) => void;
  refetch: () => Promise<void>;
}) {
  const [logging, setLogging] = useState<number | null>(null);

  async function logOneOnOne(personId: number) {
    setLogging(personId);
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "oneonone", domain: "people", personId, data: { notes: "Urgent check-in", status: "held" } }),
      });
      await refetch();
    } finally {
      setLogging(null);
    }
  }

  const highRiskBeliefs = Object.entries(data.beliefs).filter(([, b]) => b.highRisk);
  const atRiskPeople = data.flightRisk.filter((f) => f.riskLevel !== "LOW").slice(0, 3);
  const topPlan = data.attentionPlan.sequence.slice(0, 3);
  const activeCorrelations = data.correlations.slice(0, 3);

  return (
    <div className="flex h-full flex-col gap-4 p-3 text-sm">
      {/* Do this now */}
      <section className="rounded-xl border border-indigo-700/50 bg-indigo-950/30 p-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-400">Do this now</div>
        {data.highestLeverageAction ? (
          <>
            <div className="text-sm font-medium text-slate-100">{data.highestLeverageAction.action}</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                {data.highestLeverageAction.source}
              </span>
              <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${URGENCY_COLOR[data.highestLeverageAction.urgency]}`}>
                {data.highestLeverageAction.urgency}
              </span>
            </div>
          </>
        ) : (
          <div className="text-slate-500">No urgent actions.</div>
        )}
      </section>

      {/* Bayesian alerts */}
      {highRiskBeliefs.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Bayesian alerts</div>
          <div className="space-y-2">
            {highRiskBeliefs.map(([key, b]) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-300">{b.label}</div>
                  <div className="text-[10px] text-slate-500">{b.appliedEvidence.length} signals</div>
                </div>
                <div className="text-lg font-bold text-red-400">{b.posteriorPct}%</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Flight risk */}
      {atRiskPeople.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Flight risk</div>
          <div className="space-y-2">
            {atRiskPeople.map((p) => (
              <div key={p.personId} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs text-slate-200">{p.personName}</div>
                  <span className={`text-[10px] ${RISK_COLOR[p.riskLevel]}`}>
                    {p.riskScore}% · {p.riskLevel}
                  </span>
                </div>
                <button
                  onClick={() => logOneOnOne(p.personId)}
                  disabled={logging === p.personId}
                  className="shrink-0 rounded-lg bg-indigo-600 px-2 py-1 text-[10px] text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {logging === p.personId ? "…" : "1:1 Now"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Week plan preview */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Week plan preview</div>
        <div className="space-y-2">
          {topPlan.length === 0 && <div className="text-xs text-slate-500">Nothing scheduled.</div>}
          {topPlan.map((item) => (
            <div key={item.id} className="text-xs">
              <div className="truncate text-slate-200">{item.title}</div>
              <div className="text-[10px] text-slate-500">
                ROI {item.roi} · {item.hours}h
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => navigate("attention")} className="mt-2 text-xs text-indigo-400 hover:text-indigo-300">
          See full plan →
        </button>
      </section>

      {/* Active correlations */}
      {activeCorrelations.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Active correlations</div>
          <div className="space-y-2">
            {activeCorrelations.map((c) => (
              <div key={c.id} className="flex items-start gap-2">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${c.combinedSev >= 4 ? "bg-red-500" : "bg-yellow-500"}`} />
                <div className="min-w-0">
                  <div className="truncate text-xs text-slate-200">{c.name}</div>
                  <div className="truncate text-[10px] text-slate-500">{c.description}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-auto pt-2 text-[10px] text-slate-600">
        Updated {new Date(data.generatedAt).toLocaleTimeString()}
        <br />
        Updated every 30s
      </div>
    </div>
  );
}
