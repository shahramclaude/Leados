import type { ReactNode } from "react";
import { cn } from "../utils/cn";

const NAV = [
  { route: "/maturity", label: "Maturity Radar" },
  { route: "/events", label: "Event Log" },
  { route: "/about", label: "About / Provenance" },
];

export function Shell({
  route,
  navigate,
  children,
}: {
  route: string;
  navigate: (r: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 font-bold text-white shadow-lg shadow-indigo-900/40">
              L
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-white">LeadOS · pt-P</p>
              <p className="text-xs text-slate-400">Organizational Life Stage Intelligence</p>
            </div>
          </div>
          <nav className="ml-auto flex gap-1 rounded-xl bg-slate-900 p-1">
            {NAV.map((n) => (
              <button
                key={n.route}
                onClick={() => navigate(n.route)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  route === n.route ? "bg-violet-600 text-white shadow" : "text-slate-400 hover:text-white"
                )}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-6 pb-10 pt-4 text-xs text-slate-500">
        Single-tenant synthetic event log. Scores reflect logging coverage in this demo, not validated
        organizational science. See <span className="text-slate-300">About / Provenance</span> for what is verified vs. original vs. unverified.
      </footer>
    </div>
  );
}
