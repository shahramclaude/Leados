import type { ReactNode } from "react";

export type Route = "today" | "signals" | "inference" | "about";

const NAV: Array<{ id: Route; label: string }> = [
  { id: "today", label: "Today" },
  { id: "signals", label: "Signal Board" },
  { id: "inference", label: "Inference Engine" },
  { id: "about", label: "About / Provenance" },
];

export function Shell({
  route,
  onNavigate,
  children,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center font-bold text-slate-950 text-sm">
              L
            </div>
            <div>
              <div className="font-semibold leading-tight tracking-tight">LeadOS pt-M</div>
              <div className="text-[11px] text-slate-400 leading-tight">Inference Chain Engine &middot; Part 1</div>
            </div>
          </div>
          <nav className="flex gap-1 flex-wrap">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => onNavigate(n.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  route === n.id
                    ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6">{children}</main>
      <footer className="border-t border-slate-800 text-center text-[11px] text-slate-500 py-4">
        Synthetic data, local-only (localStorage). No events are ever written without your action. See About / Provenance.
      </footer>
    </div>
  );
}

export function SectionCard({ title, subtitle, children, right }: { title: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold text-slate-100">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Pill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "red" | "amber" | "cyan" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-800 text-slate-300 ring-slate-700",
    green: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    red: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    cyan: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${tones[tone]}`}>{children}</span>;
}
