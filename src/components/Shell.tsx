import type { ReactNode } from "react";

const NAV = [
  { id: "/today", label: "Today" },
  { id: "/talent", label: "Talent Architecture" },
  { id: "/financial", label: "Financial OS" },
  { id: "/regulatory", label: "Regulatory" },
  { id: "/narrative", label: "Narrative Intel" },
  { id: "/physics", label: "Org Physics" },
  { id: "/about", label: "About / Provenance" },
];

export function Shell({ route, navigate, children }: { route: string; navigate: (r: string) => void; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">L</div>
            <div>
              <div className="text-sm font-semibold leading-tight text-slate-900">LEADOS · pt-U</div>
              <div className="text-[11px] leading-tight text-slate-400">Talent · Financial OS · Regulatory · Narrative · Org Physics</div>
            </div>
          </div>
          <nav className="ml-auto flex flex-wrap items-center gap-1">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => navigate(n.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  route === n.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-2 text-xs text-slate-400 sm:px-6">
        Synthetic demo data. Formulas and benchmarks are labeled throughout — see each card's disclosure line, and{" "}
        <button className="underline" onClick={() => navigate("/about")}>About / Provenance</button>.
      </footer>
    </div>
  );
}
