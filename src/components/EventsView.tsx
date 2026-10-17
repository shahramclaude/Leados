import { useMemo, useState } from "react";
import type { AppState } from "../lib/types";
import { EVENT_CATALOG, EVENT_LABELS } from "../lib/eventCatalog";
import { DIMENSIONS } from "../lib/maturity";

export function EventsView({
  state,
  onAddEvent,
  onRemoveEvent,
}: {
  state: AppState;
  onAddEvent: (type: string) => void;
  onRemoveEvent: (id: string) => void;
}) {
  const [filter, setFilter] = useState<string>("ALL");

  const grouped = useMemo(() => {
    if (filter === "ALL") return EVENT_CATALOG;
    return EVENT_CATALOG.filter((e) => e.dimensions.includes(filter as any));
  }, [filter]);

  const recent = [...state.events].slice(-12).reverse();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("ALL")}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filter === "ALL" ? "bg-violet-600 text-white" : "bg-slate-900 text-slate-400"
            }`}
          >
            All
          </button>
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              onClick={() => setFilter(d.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                filter === d.key ? "bg-violet-600 text-white" : "bg-slate-900 text-slate-400"
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {grouped.map((e) => {
            const loggedCount = state.events.filter((ev) => ev.type === e.type).length;
            return (
              <button
                key={e.type}
                onClick={() => onAddEvent(e.type)}
                className="group flex flex-col items-start rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-left transition-colors hover:border-violet-600 hover:bg-slate-900"
              >
                <div className="flex w-full items-center justify-between">
                  <p className="text-sm font-semibold text-white">{e.label}</p>
                  {loggedCount > 0 && (
                    <span className="rounded-full bg-violet-600/20 px-2 py-0.5 text-[10px] font-bold text-violet-300">
                      ×{loggedCount}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">{e.hint}</p>
                <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-600 group-hover:text-violet-400">
                  Click to log event
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <p className="mb-3 text-sm font-semibold text-white">Recent events ({state.events.length} total)</p>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">No events logged yet. Click a tile to the left, or apply a preset from the Maturity Radar page.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((ev) => (
              <li
                key={ev.id}
                className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-2 text-xs"
              >
                <span className="text-slate-300">{EVENT_LABELS[ev.type] ?? ev.type}</span>
                <button onClick={() => onRemoveEvent(ev.id)} className="text-slate-600 hover:text-rose-400">
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
