"use client";

import { useState } from "react";

interface TimelineEntry {
  kind: string;
  at: string;
  summary: string;
  detail: unknown;
}

interface TraceResponse {
  correlationId: string;
  found: boolean;
  eventCount: number;
  timeline: TimelineEntry[];
}

export default function TraceSearch() {
  const [correlationId, setCorrelationId] = useState("");
  const [result, setResult] = useState<TraceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(id: string) {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trace/${encodeURIComponent(id.trim())}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as TraceResponse;
      setResult(data);
    } catch (err) {
      setError(String(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(correlationId);
        }}
      >
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="cor_xxxxxxxx-xxxx-..."
          value={correlationId}
          onChange={(e) => setCorrelationId(e.target.value)}
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Searching…" : "Explain"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-6">
          <p className="text-sm text-slate-500">
            {result.found ? `${result.eventCount} event(s) found` : "No events found for this correlationId"}
          </p>
          <ol className="mt-4 space-y-3 border-l-2 border-slate-300 pl-4">
            {result.timeline.map((entry, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full bg-slate-500" />
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  {entry.kind} · {entry.at}
                </p>
                <p className="text-sm font-medium text-slate-900">{entry.summary}</p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-slate-500">raw</summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                    {JSON.stringify(entry.detail, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
