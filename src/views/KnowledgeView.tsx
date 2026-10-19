"use client";
import React, { useEffect, useState } from "react";
import type { GraphEdge, GraphNode, InstitutionalPattern, AdaptivePlaybook } from "@/lib/types";
import type { DecisionState } from "@/lib/eventBrain";

interface KnowledgeData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  institutionalMemory: InstitutionalPattern[];
  firingPlaybooks: AdaptivePlaybook[];
  decisions: DecisionState[];
}

const DOMAIN_COLOR: Record<string, string> = {
  people: "#38bdf8",
  finance: "#34d399",
  strategy: "#a78bfa",
  execution: "#f59e0b",
  rd: "#f472b6",
  sales: "#fb7185",
  knowledge: "#94a3b8",
  manufacturing: "#facc15",
};

export function KnowledgeView() {
  const [data, setData] = useState<KnowledgeData | null>(null);
  const [rootCauseFor, setRootCauseFor] = useState<string | null>(null);
  const [rootCauses, setRootCauses] = useState<{ ruleId: string; hops: number; confidence: number }[]>([]);
  const [activePlaybook, setActivePlaybook] = useState<AdaptivePlaybook | null>(null);

  useEffect(() => {
    fetch("/api/knowledge").then((r) => r.json()).then(setData);
  }, []);

  async function findRoot(ruleId: string) {
    setRootCauseFor(ruleId);
    const r = await fetch(`/api/knowledge?rootCauseOf=${encodeURIComponent(ruleId)}`);
    const d = await r.json();
    setRootCauses(d.rootCauses ?? []);
  }

  async function openPlaybook(ruleId: string) {
    const r = await fetch(`/api/knowledge?playbookFor=${encodeURIComponent(ruleId)}`);
    const d = await r.json();
    setActivePlaybook(d.playbook);
  }

  if (!data) return <div className="text-sm text-slate-500">Loading knowledge graph…</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Knowledge Architecture</h1>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-2 text-sm font-semibold text-slate-200">Causal Knowledge Graph (Fruchterman-Reingold layout)</div>
        <svg width="100%" height={420} viewBox="0 0 900 420" className="rounded-lg bg-slate-950">
          {data.edges.map((e, i) => {
            const s = data.nodes.find((n) => n.id === e.source);
            const t = data.nodes.find((n) => n.id === e.target);
            if (!s || !t) return null;
            return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={e.active ? "#f59e0b" : "#334155"} strokeWidth={e.active ? 2.5 : 1} />;
          })}
          {data.nodes.map((n) => (
            <g key={n.id} onClick={() => findRoot(n.id)} className="cursor-pointer">
              <circle cx={n.x} cy={n.y} r={10} fill={DOMAIN_COLOR[n.domain] ?? "#64748b"} stroke="#0f172a" strokeWidth={1.5} />
              <text x={n.x} y={n.y - 14} fontSize={8} fill="#cbd5e1" textAnchor="middle">
                {n.label.slice(0, 18)}
              </text>
            </g>
          ))}
        </svg>
        {rootCauseFor && (
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs">
            <div className="mb-1 font-semibold text-slate-300">Root causes for {rootCauseFor} (backward BFS, confidence decays 0.9/hop):</div>
            {rootCauses.map((r) => (
              <div key={r.ruleId} className="text-slate-400">
                {r.ruleId} — {r.hops} hop(s), confidence {r.confidence.toFixed(3)}
              </div>
            ))}
            {rootCauses.length === 0 && <div className="text-slate-500">No further upstream causes found — this is itself a root cause.</div>}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-2 text-sm font-semibold text-slate-200">Institutional Memory Digest</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-1">Pattern</th>
                <th className="pb-1">Occurrences</th>
                <th className="pb-1">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {data.institutionalMemory.map((p) => (
                <tr key={p.pattern} className="border-t border-slate-800">
                  <td className="py-1 text-slate-300">{p.pattern}</td>
                  <td className="py-1 text-slate-400">{p.occurrences}</td>
                  <td className="py-1 text-slate-500">{new Date(p.lastSeen).toLocaleDateString()}</td>
                </tr>
              ))}
              {data.institutionalMemory.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-2 text-slate-500">
                    No repeating patterns detected yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-2 text-sm font-semibold text-slate-200">Adaptive Playbook Generator</div>
          <div className="flex flex-wrap gap-2">
            {data.firingPlaybooks.map((pb) => (
              <button key={pb.basedOn} onClick={() => openPlaybook(pb.basedOn)} className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:border-sky-500 hover:text-sky-300">
                {pb.basedOn}
              </button>
            ))}
            {data.firingPlaybooks.length === 0 && <div className="text-xs text-slate-500">No active findings to generate a playbook for right now.</div>}
          </div>
          {activePlaybook && (
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
              <div className="mb-1 text-xs font-semibold text-slate-200">{activePlaybook.title}</div>
              <ol className="list-decimal space-y-1 pl-4 text-[11px] text-slate-400">
                {activePlaybook.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-2 text-sm font-semibold text-slate-200">Decision Ledger</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-1">Decision</th>
              <th className="pb-1">Domain</th>
              <th className="pb-1">Opened</th>
              <th className="pb-1">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {data.decisions.map((d) => (
              <tr key={d.id} className="border-t border-slate-800">
                <td className="py-1 text-slate-300">{d.title}</td>
                <td className="py-1 capitalize text-slate-400">{d.domain}</td>
                <td className="py-1 text-slate-500">{new Date(d.openedAt).toLocaleDateString()}</td>
                <td className="py-1 text-slate-500">{d.outcome ?? "open"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
