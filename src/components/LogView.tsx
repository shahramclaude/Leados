import type { AnyEvent } from "../lib/core";

export function LogView({
  events,
  onWipe,
  onExport,
}: {
  events: AnyEvent[];
  onWipe: () => void;
  onExport: () => void;
}) {
  const sorted = [...events].sort((a, b) => b.ts - a.ts);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Log</h1>
          <p className="text-sm text-slate-500">
            Append-only. {events.length} event{events.length === 1 ? "" : "s"} total. Nothing derived
            is stored &mdash; every other view recomputes from this array.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onExport} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500">
            Export JSON
          </button>
          <button onClick={onWipe} className="rounded-md border border-rose-900 px-3 py-1.5 text-xs text-rose-300 hover:border-rose-600">
            Wipe + reseed
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-xs">
          <thead className="bg-slate-900/80 text-slate-400">
            <tr>
              <th className="text-left px-3 py-2">ts</th>
              <th className="text-left px-3 py-2">type</th>
              <th className="text-left px-3 py-2">payload</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => (
              <tr key={e.id} className="border-t border-slate-800 text-slate-400">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(e.ts).toLocaleString()}</td>
                <td className="px-3 py-2 text-indigo-300 font-mono">{e.type}</td>
                <td className="px-3 py-2 font-mono truncate max-w-md">{JSON.stringify(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
