import type { ReactNode } from "react";
import { cn } from "../utils/cn";

const NAV = [
  { route: "/today", label: "Today" },
  { route: "/signals", label: "Signal Board" },
  { route: "/inference", label: "Inference" },
  { route: "/autonomous", label: "Autonomous" },
  { route: "/leadership-science", label: "Leadership Science" },
  { route: "/protocol", label: "Protocols" },
  { route: "/decision-trees", label: "Decision Trees" },
  { route: "/memory", label: "Institutional Memory" },
  { route: "/self-improve", label: "Self-Improve" },
  { route: "/docs", label: "Docs" },
  { route: "/onboarding", label: "Onboarding" },
  { route: "/about", label: "About / Provenance" },
];

export function Shell({ route, navigate, children }: { route: string; navigate: (r: string) => void; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white">
              L
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Leados Sandbox</div>
              <div className="text-xs text-slate-400">Leadership intelligence — synthetic data only</div>
            </div>
          </div>
        </div>
        <nav className="scrollbar-none mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6 pb-3">
          {NAV.map((item) => (
            <button
              key={item.route}
              onClick={() => navigate(item.route)}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition",
                route === item.route ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-100",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      <footer className="mx-auto max-w-7xl px-6 pb-10 text-xs text-slate-400">
        All data is synthetic and stored only in this browser's localStorage. See About / Provenance for what is verified
        vs. original vs. disclosed-unverified.
      </footer>
    </div>
  );
}
