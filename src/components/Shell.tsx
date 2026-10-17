import type { ReactNode } from "react";

export type Route = "/today" | "/intelligence" | "/people" | "/log" | "/about";

const NAV: { route: Route; label: string; icon: string }[] = [
  { route: "/today", label: "Today", icon: "☀" },
  { route: "/intelligence", label: "Intelligence", icon: "◈" },
  { route: "/people", label: "People", icon: "◎" },
  { route: "/log", label: "Event Log", icon: "≋" },
  { route: "/about", label: "About / Provenance", icon: "ⓘ" },
];

export function Shell({
  current,
  onNavigate,
  children,
}: {
  current: string;
  onNavigate: (r: Route) => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 p-5 md:flex">
          <div className="mb-8">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-sm font-bold text-slate-950 shadow-lg shadow-orange-900/40">
                pt-L
              </div>
              <div>
                <div className="text-sm font-semibold tracking-tight text-white">LeadOS</div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400">Thermodynamics</div>
              </div>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {NAV.map((n) => (
              <button
                key={n.route}
                onClick={() => onNavigate(n.route)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                  current === n.route
                    ? "bg-gradient-to-r from-orange-500/20 to-rose-500/10 text-white ring-1 ring-orange-500/30"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                <span className="w-4 text-center text-base opacity-80">{n.icon}</span>
                {n.label}
              </button>
            ))}
          </nav>
          <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-[11px] leading-relaxed text-slate-500">
            Every model here is labeled with its scientific basis. Every measurement is bounded by data
            availability. Every claim is a computational inference, not an assertion.
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-5 py-3 md:hidden">
            <div className="text-sm font-semibold text-white">LeadOS · pt-L</div>
            <select
              className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
              value={current}
              onChange={(e) => onNavigate(e.target.value as Route)}
            >
              {NAV.map((n) => (
                <option key={n.route} value={n.route}>
                  {n.label}
                </option>
              ))}
            </select>
          </header>
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl px-5 py-8 md:px-10">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
