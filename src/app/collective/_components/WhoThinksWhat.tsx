"use client";

import { useState } from "react";

interface Row {
  forecasterId: string;
  anonymousTag: string;
  displayName: string;
  probability: number;
  rationale: string;
}

export function WhoThinksWhat({ rows }: { rows: Row[] }) {
  const [anonymized, setAnonymized] = useState(true);

  return (
    <div className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-950">Who thinks what</h3>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={anonymized} onChange={(e) => setAnonymized(e.target.checked)} />
          Anonymity mode
        </label>
      </div>
      <ul className="mt-4 grid gap-3">
        {rows.map((r) => (
          <li key={r.forecasterId} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-950">{anonymized ? r.anonymousTag : r.displayName}</span>
              <span className="font-mono text-slate-700">{(r.probability * 100).toFixed(0)}%</span>
            </div>
            {r.rationale && <p className="mt-1 text-xs text-slate-600">{r.rationale}</p>}
          </li>
        ))}
        {rows.length === 0 && <p className="text-xs text-slate-500">No forecasts submitted yet.</p>}
      </ul>
    </div>
  );
}
