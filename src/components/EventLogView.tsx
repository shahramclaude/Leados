import { useMemo, useState } from "react";
import type { AppState } from "../lib/types";
import { deleteEvent, resetToSeed, wipeAll } from "../lib/store";
import { Card, Button, Badge, EmptyState } from "./ui";
import { fmtDateTime } from "../lib/format";

export function EventLogView({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const [filter, setFilter] = useState("");
  const events = useMemo(() => {
    const sorted = [...state.events].sort((a, b) => (a.ts < b.ts ? 1 : -1));
    if (!filter) return sorted;
    const f = filter.toLowerCase();
    return sorted.filter((e) => e.type.toLowerCase().includes(f) || JSON.stringify(e.data).toLowerCase().includes(f));
  }, [state.events, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Event log</h1>
          <p className="mt-1 text-sm text-zinc-400">{state.events.length} events total — the single source of truth for every other view.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setState(resetToSeed())}>
            Reset demo data
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm("Wipe all events? This cannot be undone.")) setState(wipeAll());
            }}
          >
            Wipe all
          </Button>
        </div>
      </div>

      <input
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-600"
        placeholder="Filter by type or content…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <Card>
        {events.length === 0 ? (
          <EmptyState>No events match.</EmptyState>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-2 py-2">When</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Data</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-zinc-800 align-top hover:bg-zinc-900/40">
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-zinc-500">{fmtDateTime(e.ts)}</td>
                    <td className="px-2 py-2">
                      <Badge>{e.type}</Badge>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-zinc-400">{JSON.stringify(e.data)}</td>
                    <td className="px-2 py-2">
                      <button className="text-xs text-red-400 hover:text-red-300" onClick={() => setState(deleteEvent(state, e.id))}>
                        delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
