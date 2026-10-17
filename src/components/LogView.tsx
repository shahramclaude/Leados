import { Card } from "./Card";
import type { AppEvent } from "../lib/types";

export function LogView({ events, onWipe }: { events: AppEvent[]; onWipe: () => void }) {
  function exportJson() {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leados-lite-events.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Card title="Raw event log">
        <div className="mb-3 flex gap-3">
          <button onClick={exportJson} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Export JSON
          </button>
          <button
            onClick={onWipe}
            className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
          >
            Wipe log
          </button>
        </div>
        <div className="max-h-[32rem] overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-emerald-300">
          {events.length === 0 && <div className="text-slate-500">No events yet.</div>}
          {[...events].reverse().map((e) => (
            <div key={e.id} className="mb-1 whitespace-pre-wrap break-all border-b border-slate-800 pb-1">
              <span className="text-slate-500">{e.ts}</span> <span className="text-sky-300">{e.type}</span>{" "}
              {JSON.stringify(e.payload)}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
