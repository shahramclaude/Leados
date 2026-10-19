"use client";

import { useEffect, useState } from "react";
import type { KnowledgeGraph } from "@/lib/knowledgeGraph";

type KnowledgeApiResponse = {
  graph: KnowledgeGraph;
  rootCausesByNode: { nodeId: number; rootCauses: number[] }[];
  halfLife: number;
  similarPairs: { a: number; b: number; similarity: number }[];
};

export default function KnowledgeView() {
  const [data, setData] = useState<KnowledgeApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/knowledge")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-sm text-red-400">Failed to load: {error}</div>;
  if (!data) return <div className="animate-pulse text-sm text-slate-500">Loading knowledge graph…</div>;

  const byId = new Map(data.graph.nodes.map((n) => [n.id, n]));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Knowledge Graph</h1>
      <p className="text-xs text-slate-500">Knowledge half-life: {data.halfLife.toFixed(1)} days</p>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Nodes & Root Causes</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.graph.nodes.map((n) => {
            const causes = data.rootCausesByNode.find((r) => r.nodeId === n.id)?.rootCauses ?? [];
            return (
              <div key={n.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                <p className="text-sm font-medium text-slate-200">{n.label}</p>
                <p className="text-[10px] text-slate-500">
                  {n.domain} · {n.severity}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {n.tags.map((t) => (
                    <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Root causes:{" "}
                  {causes.length > 0 ? causes.map((id) => byId.get(id)?.label ?? id).join(", ") : "none upstream"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Pattern Similarity (Jaccard)</h2>
        <ul className="space-y-1 text-xs text-slate-400">
          {data.similarPairs.map((pair, i) => (
            <li key={i}>
              {byId.get(pair.a)?.label} ↔ {byId.get(pair.b)?.label}: {(pair.similarity * 100).toFixed(0)}%
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
