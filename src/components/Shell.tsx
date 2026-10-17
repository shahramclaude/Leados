import type { ReactNode } from "react";
import type { DensityMode } from "../lib/aesthetics";

export type Route =
  | "today"
  | "domains"
  | "decisions"
  | "aesthetics"
  | "health"
  | "log"
  | "about";

const ROUTES: { id: Route; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "domains", label: "Domains" },
  { id: "decisions", label: "Decisions" },
  { id: "aesthetics", label: "Aesthetics" },
  { id: "health", label: "Health" },
  { id: "log", label: "Log" },
  { id: "about", label: "About" },
];

export function Shell({
  route,
  onNavigate,
  densityMode,
  onDensityChange,
  onResetFamiliarity,
  children,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  densityMode: DensityMode;
  onDensityChange: (m: DensityMode) => void;
  onResetFamiliarity: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside className="w-60 shrink-0 border-r border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-6">
          <div>
            <div className="text-sm font-semibold tracking-wide text-indigo-300">LeadOS</div>
            <div className="text-xs text-slate-500">pt-J rebuild &middot; React</div>
          </div>
          <nav className="flex flex-col gap-1">
            {ROUTES.map((r) => (
              <button
                key={r.id}
                onClick={() => onNavigate(r.id)}
                className={`text-left rounded-md px-3 py-2 text-sm transition ${
                  route === r.id
                    ? "bg-indigo-500/20 text-indigo-200 font-medium"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                #/{r.id}
              </button>
            ))}
          </nav>

          <div className="mt-auto space-y-3 border-t border-slate-800 pt-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                Density mode
              </label>
              <select
                value={densityMode}
                onChange={(e) => onDensityChange(e.target.value as DensityMode)}
                className="w-full rounded-md bg-slate-800 border border-slate-700 text-sm px-2 py-1.5 text-slate-200"
              >
                <option value="COMPACT">COMPACT</option>
                <option value="STANDARD">STANDARD</option>
                <option value="COMFORTABLE">COMFORTABLE</option>
                <option value="READING">READING</option>
              </select>
            </div>
            <button
              onClick={onResetFamiliarity}
              className="w-full rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-500 transition"
            >
              Reset familiarity (session)
            </button>
          </div>
        </aside>
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-6 md:p-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
