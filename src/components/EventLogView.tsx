import { useState } from "react";
import type { OrgEvent } from "../lib/types";
import { Card, Label } from "./ui";

export function EventLogView({
  events,
  onReset,
  onWipe,
}: {
  events: OrgEvent[];
  onReset: () => void;
  onWipe: () => void;
}) {
  const [filter, setFilter] = useState("");
  const filtered = events.filter((e) => !filter || e.type.includes(filter) || JSON.stringify(e.data).includes(filter));
  const sorted = [...filtered].sort((a, b) => b.ts.localeCompare(a.ts));

  function exportJson() {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leados-pt-l-events.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Event Log</h1>
          <p className="mt-1 text-sm text-slate-400">{events.length} events · append-only · stored in this browser's localStorage</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportJson} className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">
            Export JSON
          </button>
          <button onClick={onReset} className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">
            Reset to seed
          </button>
          <button onClick={onWipe} className="rounded-lg border border-rose-800 bg-rose-950/40 px-3 py-2 text-xs text-rose-300 hover:bg-rose-900/40">
            Wipe all
          </button>
        </div>
      </div>

      <input
        placeholder="Filter by type or content…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
      />

      <Card>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-900">
              <tr className="text-[10px] uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-3">Date</th>
                <th className="pb-2 pr-3">Type</th>
                <th className="pb-2">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sorted.map((e) => (
                <tr key={e.id}>
                  <td className="py-1.5 pr-3 font-mono text-slate-500">{e.ts}</td>
                  <td className="py-1.5 pr-3 font-mono text-amber-300">{e.type}</td>
                  <td className="py-1.5 font-mono text-slate-400">{JSON.stringify(e.data)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Label>Raw, unfiltered event stream — this is the "noise" half of the Thermodynamics signal-to-noise metric.</Label>
      </Card>
    </div>
  );
}
