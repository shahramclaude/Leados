"use client";
import React, { useEffect, useState } from "react";

const SEV_COLOR: Record<string, string> = { critical: "bg-rose-500/20 text-rose-300 border-rose-500/40", high: "bg-orange-500/20 text-orange-300 border-orange-500/40", medium: "bg-amber-500/20 text-amber-300 border-amber-500/40", low: "bg-slate-500/20 text-slate-300 border-slate-500/40" };

interface CockpitData {
  brief: string;
  orgHealthScore: number;
  firing: { ruleId: string; name: string; domain: string; severity: string | null; confidence: number }[];
  activeCascades: { link: { description: string }; effectiveSeverityScore: number }[];
  kpis: Record<string, number | null>;
}

export function CockpitView({ onNavigate }: { onNavigate: (v: string) => void }) {
  const [data, setData] = useState<CockpitData | null>(null);

  useEffect(() => {
    fetch("/api/cockpit").then((r) => r.json()).then(setData);
  }, []);

  if (!data) return <div className="text-sm text-slate-500">Loading cockpit…</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-900/40 p-6">
        <div className="text-xs uppercase tracking-wide text-slate-500">Morning Brief</div>
        <p className="mt-2 text-lg leading-relaxed text-slate-100">{data.brief}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Org Health" value={`${Math.round(data.orgHealthScore)}/100`} />
        <Kpi label="Active Projects" value={String(data.kpis.activeProjects ?? 0)} />
        <Kpi label="Open Decisions" value={String(data.kpis.openDecisions ?? 0)} />
        <Kpi label="Runway (p50)" value={data.kpis.runwayP50 != null ? `${(data.kpis.runwayP50 as number).toFixed(1)}mo` : "n/a"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-200">Top Firing Signals</div>
          <div className="space-y-2">
            {data.firing.length === 0 && <div className="text-xs text-slate-500">No active signals.</div>}
            {data.firing.map((f) => (
              <button key={f.ruleId} onClick={() => onNavigate("signals")} className="flex w-full items-center justify-between rounded-lg border border-slate-800 px-3 py-2 text-left hover:border-slate-700">
                <div>
                  <div className="text-sm text-slate-100">{f.name}</div>
                  <div className="text-[11px] capitalize text-slate-500">{f.domain}</div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${SEV_COLOR[f.severity ?? "low"]}`}>{f.severity}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-200">Active Cascades</div>
          <div className="space-y-2">
            {data.activeCascades.length === 0 && <div className="text-xs text-slate-500">No active causal cascades right now.</div>}
            {data.activeCascades.map((c, i) => (
              <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                {c.link.description} <span className="text-amber-400">(effective severity {c.effectiveSeverityScore.toFixed(1)})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {["strategy", "finance", "execution", "signals", "knowledge"].map((v) => (
          <button key={v} onClick={() => onNavigate(v)} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs capitalize text-slate-300 hover:border-sky-500 hover:text-sky-300">
            Go to {v} →
          </button>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-100">{value}</div>
    </div>
  );
}
