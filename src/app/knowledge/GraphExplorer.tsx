"use client";

import { useState } from "react";

interface EntityOption {
  key: string;
  name: string;
  type: string;
}

type GraphResult = Record<string, unknown> | null;

export default function GraphExplorer({ entityOptions }: { entityOptions: EntityOption[] }) {
  const [mode, setMode] = useState<"neighbors" | "path" | "blast" | "orphans">("neighbors");
  const [key, setKey] = useState(entityOptions[0]?.key ?? "");
  const [toKey, setToKey] = useState(entityOptions[1]?.key ?? "");
  const [depth, setDepth] = useState(2);
  const [result, setResult] = useState<GraphResult>(null);
  const [loading, setLoading] = useState(false);

  async function runQuery() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode, depth: String(depth) });
      if (mode === "neighbors" || mode === "blast") params.set("key", key);
      if (mode === "path") {
        params.set("from", key);
        params.set("to", toKey);
      }
      const res = await fetch(`/api/knowledge/graph?${params.toString()}`);
      const data = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-slate-600">
          Mode
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="neighbors">Neighbors (N hops)</option>
            <option value="path">Shortest influence path</option>
            <option value="blast">Blast radius</option>
            <option value="orphans">Orphan detection</option>
          </select>
        </label>

        {(mode === "neighbors" || mode === "blast" || mode === "path") && (
          <label className="flex flex-col text-xs text-slate-600">
            {mode === "path" ? "From entity" : "Entity"}
            <select value={key} onChange={(e) => setKey(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {entityOptions.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name} ({e.type})
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === "path" && (
          <label className="flex flex-col text-xs text-slate-600">
            To entity
            <select value={toKey} onChange={(e) => setToKey(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {entityOptions.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name} ({e.type})
                </option>
              ))}
            </select>
          </label>
        )}

        {(mode === "neighbors" || mode === "blast") && (
          <label className="flex flex-col text-xs text-slate-600">
            Depth
            <input
              type="number"
              min={1}
              max={6}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="mt-1 w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        )}

        <button
          onClick={runQuery}
          disabled={loading}
          className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Running…" : "Run query"}
        </button>
      </div>

      {result && (
        <pre className="max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
