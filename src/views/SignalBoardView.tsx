"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Heatmap } from "@/components/Heatmap";
import type { CalibrationReport, Cascade, Domain, GraphEdge, GraphNode, RuleEvaluation } from "@/lib/types";
import { DOMAINS } from "@/lib/types";

interface SignalsData {
  evaluations: RuleEvaluation[];
  cascades: Cascade[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  heatmap: { ruleId: string; domain: Domain; severity: string | null; days: { day: string; firing: boolean }[] }[];
  days: string[];
  calibration: CalibrationReport[];
}

const SEV_COLOR: Record<string, string> = { critical: "#f43f5e", high: "#f97316", medium: "#f59e0b", low: "#64748b" };
const STATUS_COLOR: Record<string, string> = { active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", inactive: "border-slate-700 bg-slate-800/40 text-slate-400", snoozed: "border-violet-500/40 bg-violet-500/10 text-violet-300", calibrating: "border-sky-500/40 bg-sky-500/10 text-sky-300" };
const DOMAIN_COLOR: Record<string, string> = { people: "#38bdf8", finance: "#34d399", strategy: "#a78bfa", execution: "#f59e0b", rd: "#f472b6", sales: "#fb7185", knowledge: "#94a3b8", manufacturing: "#facc15" };

export function SignalBoardView() {
  const [data, setData] = useState<SignalsData | null>(null);
  const [domainTab, setDomainTab] = useState<Domain>("people");
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/signals").then((r) => r.json()).then(setData);
  }, []);

  const rulesForDomain = useMemo(() => (data ? data.evaluations.filter((e) => e.domain === domainTab) : []), [data, domainTab]);

  if (!data) return <div className="text-sm text-slate-500">Loading signal board…</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Signal Board — 48 Rules</h1>

      <section>
        <div className="mb-2 flex flex-wrap gap-2">
          {DOMAINS.map((d) => (
            <button key={d} onClick={() => setDomainTab(d)} className={`rounded-full px-3 py-1 text-xs capitalize ${domainTab === d ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"}`}>
              {d}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {rulesForDomain.map((r) => {
            const hist = (data.calibration.find((c) => c.ruleId === r.ruleId)?.points ?? []);
            const calib = data.calibration.find((c) => c.ruleId === r.ruleId);
            return (
              <div key={r.ruleId} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-semibold text-slate-100">{r.name}</div>
                  {r.severity && <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase text-white" style={{ backgroundColor: SEV_COLOR[r.severity] }}>{r.severity}</span>}
                </div>
                <div className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase ${STATUS_COLOR[r.status]}`}>{r.status}</div>
                <div className="mt-2 h-1.5 rounded bg-slate-800">
                  <div className="h-1.5 rounded bg-sky-500" style={{ width: `${Math.round(r.confidence * 100)}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-slate-500">{r.scoreMath}</div>
                <button onClick={() => setExpandedRule(expandedRule === r.ruleId ? null : r.ruleId)} className="mt-2 text-[11px] text-sky-400 hover:underline">
                  {expandedRule === r.ruleId ? "Collapse ▲" : "Expand ▼"}
                </button>
                <a href="#knowledge" className="ml-3 text-[11px] text-slate-500 hover:text-slate-300">
                  ⟶ Playbook
                </a>
                {expandedRule === r.ruleId && (
                  <div className="mt-2 space-y-1 border-t border-slate-800 pt-2 text-[11px] text-slate-400">
                    <div>{r.description}</div>
                    <div>
                      <span className="text-slate-500">Fires when:</span> {r.firesWhen}
                    </div>
                    <div>
                      <span className="text-slate-500">Resolves when:</span> {r.resolvesWhen}
                    </div>
                    <div>
                      <span className="text-slate-500">Basis:</span> {r.basis}
                    </div>
                    {calib && (
                      <div className="text-slate-500">
                        Confirmation rate: {Math.round(calib.confirmationRate * 100)}% ({calib.confirmed}/{calib.predictions}) — {calib.status}
                      </div>
                    )}
                    {hist.length > 0 && <div className="text-slate-600">Calibration buckets: {hist.map((p) => `${p.predictedBucket}:${p.n}`).join(", ")}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 text-sm font-semibold text-slate-200">Temporal Heatmap — last 14 days</div>
        <Heatmap
          rowLabels={data.heatmap.map((h) => h.ruleId)}
          colLabels={data.days.map((d) => d.slice(5))}
          cellWidth={20}
          cellHeight={14}
          rowLabelWidth={200}
          cell={(ri, ci) => {
            const row = data.heatmap[ri];
            const day = row.days[ci];
            const color = day.firing ? SEV_COLOR[row.severity ?? "low"] : "#1e293b";
            return { color, title: `${row.ruleId} — ${day.day}: ${day.firing ? "firing" : "inactive"}` };
          }}
        />
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 text-sm font-semibold text-slate-200">Causal Graph (all 12 links)</div>
        <svg width="100%" height={420} viewBox="0 0 900 420" className="rounded-lg bg-slate-950">
          {data.edges.map((e, i) => {
            const s = data.nodes.find((n) => n.id === e.source);
            const t = data.nodes.find((n) => n.id === e.target);
            if (!s || !t) return null;
            return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={e.active ? "#f59e0b" : "#334155"} strokeWidth={e.active ? 3 : 1} />;
          })}
          {data.nodes.map((n) => (
            <g key={n.id} onClick={() => setExpandedRule(n.id)} className="cursor-pointer">
              <circle cx={n.x} cy={n.y} r={9} fill={DOMAIN_COLOR[n.domain]} stroke="#0f172a" strokeWidth={1.5} />
              <text x={n.x} y={n.y - 12} fontSize={7.5} fill="#cbd5e1" textAnchor="middle">
                {n.id}
              </text>
            </g>
          ))}
        </svg>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-2 text-sm font-semibold text-slate-200">Calibration Summary</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-1">Rule</th>
              <th className="pb-1">Predictions</th>
              <th className="pb-1">Confirmed</th>
              <th className="pb-1">Refuted</th>
              <th className="pb-1">Confirmation Rate</th>
              <th className="pb-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.calibration.filter((c) => c.predictions > 0).map((c) => (
              <tr key={c.ruleId} className="border-t border-slate-800">
                <td className="py-1 text-slate-300">{c.ruleId}</td>
                <td className="py-1 text-slate-400">{c.predictions}</td>
                <td className="py-1 text-slate-400">{c.confirmed}</td>
                <td className="py-1 text-slate-400">{c.refuted}</td>
                <td className="py-1 text-slate-400">{Math.round(c.confirmationRate * 100)}%</td>
                <td className="py-1 text-slate-400">{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
