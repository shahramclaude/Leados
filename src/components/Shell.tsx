import type { ReactNode } from "react";
import { cn } from "../utils/cn";

const NAV: { route: string; label: string }[] = [
  { route: "/today", label: "Today" },
  { route: "/signals", label: "Signal Board" },
  { route: "/attention", label: "Attention Optimizer" },
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
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-600 font-bold text-white shadow-lg shadow-indigo-900/40">
              Λ
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-white">LeadOS · pt-U</div>
              <div className="text-[11px] text-slate-400">Autonomous Attention Optimizer</div>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((n) => (
              <button
                key={n.route}
                onClick={() => navigate(n.route)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition",
                  route === n.route
                    ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-inset ring-indigo-500/40"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                )}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-[11px] leading-relaxed text-slate-500 sm:px-6">
        Synthetic demo data. Scores, costs, and urgency windows are disclosed
        heuristics for illustration — see{" "}
        <button onClick={() => navigate("/about")} className="underline hover:text-slate-300">
          About / Provenance
        </button>{" "}
        for exactly what was verified against the real repo versus invented here.
      </footer>
    </div>
  );
}

export function Card({ title, subtitle, children, className }: { title?: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm", className)}>
      {title && <h3 className="text-sm font-semibold text-slate-100">{title}</h3>}
      {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      <div className={cn(title || subtitle ? "mt-3" : "")}>{children}</div>
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "amber" | "rose" | "emerald" | "indigo" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-800 text-slate-300 ring-slate-700",
    amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    rose: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    indigo: "bg-indigo-500/15 text-indigo-300 ring-indigo-500/30",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", tones[tone])}>
      {children}
    </span>
  );
}
