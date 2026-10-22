"use client";

import { useState } from "react";
import Link from "next/link";

interface LineageNode {
  id: string;
  nodeType: "source" | "transform" | "projection" | "surface";
  refTable: string | null;
  refId: string | null;
  label: string;
  metadata?: Record<string, unknown>;
}

interface Chain {
  nodes: LineageNode[];
}

interface TraceResponse {
  found: boolean;
  chains: Chain[];
  explanation: string;
  entity: { id: string; goldenRecord: Record<string, unknown> } | null;
}

const NODE_COLOR: Record<string, string> = {
  source: "bg-sky-100 text-sky-900 border-sky-300",
  transform: "bg-violet-100 text-violet-900 border-violet-300",
  projection: "bg-amber-100 text-amber-900 border-amber-300",
  surface: "bg-emerald-100 text-emerald-900 border-emerald-300",
};

export default function LineageExplorerPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<TraceResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    try {
      const res = await fetch(`/api/lineage?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Lineage Explorer</h1>
        <Link href="/" className="text-sm text-slate-500 underline">
          ← Back
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-sm text-slate-600">
          Search by entity id, name, email, or company to answer: <span className="font-medium">&quot;where did this number come from?&quot;</span>
        </p>
        <div className="flex gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="e.g. dana.whitfield@acme-hr.com"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button onClick={search} disabled={loading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Trace
          </button>
        </div>
      </section>

      {result && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          {result.entity ? (
            <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-900">
                Entity {result.entity.id} — {String(result.entity.goldenRecord.fullName ?? result.entity.goldenRecord.company ?? "")}
              </p>
              <pre className="mt-2 overflow-auto text-xs text-slate-600">{JSON.stringify(result.entity.goldenRecord, null, 2)}</pre>
            </div>
          ) : (
            <p className="text-sm text-rose-700">No matching entity found. Lineage cannot be traced for a value this system has not ingested.</p>
          )}

          <p className="mb-4 text-sm text-slate-600">{result.explanation}</p>

          {result.chains.map((chain, i) => (
            <div key={i} className="mb-4 flex flex-wrap items-center gap-2">
              {chain.nodes.map((node, j) => (
                <div key={node.id}>
                  <span className={`inline-block rounded-lg border px-3 py-2 text-xs ${NODE_COLOR[node.nodeType]}`}>
                    <strong className="uppercase">{node.nodeType}</strong>
                    <br />
                    {node.label}
                  </span>
                  {j < chain.nodes.length - 1 && <span className="mx-2 text-slate-400">→</span>}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
