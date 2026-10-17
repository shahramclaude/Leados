import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export type Route = "today" | "intelligence" | "data" | "health" | "about";

const NAV: { id: Route; label: string; hint: string }[] = [
  { id: "today", label: "Today", hint: "Snapshot" },
  { id: "intelligence", label: "Intelligence", hint: "Velocity · Physics · Resonance" },
  { id: "data", label: "Data", hint: "Event log" },
  { id: "health", label: "Health", hint: "Self-tests" },
  { id: "about", label: "About", hint: "Verified vs. fabricated" },
];

export function Shell({ route, onNavigate, children }: { route: Route; onNavigate: (r: Route) => void; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-200 sm:flex">
          <div className="px-5 py-6">
            <div className="text-lg font-bold tracking-tight text-white">LEADOS</div>
            <div className="text-xs text-slate-400">Organizational Physics Engine</div>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => onNavigate(n.id)}
                className={cn(
                  "block w-full rounded-lg px-3 py-2 text-left text-sm transition",
                  route === n.id ? "bg-indigo-600 text-white shadow-sm" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
              >
                <div className="font-medium">{n.label}</div>
                <div className={cn("text-[11px]", route === n.id ? "text-indigo-100" : "text-slate-500")}>{n.hint}</div>
              </button>
            ))}
          </nav>
          <div className="border-t border-slate-800 px-5 py-4 text-[11px] leading-relaxed text-slate-500">
            Everything here is computed live from an append-only local event log. No network calls, no server. Labeled
            heuristics throughout — see <span className="text-slate-300">About</span>.
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:hidden">
            <div className="text-base font-bold">LEADOS</div>
            <select
              value={route}
              onChange={(e) => onNavigate(e.target.value as Route)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {NAV.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
