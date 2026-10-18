import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export type TabId = "today" | "signals" | "beliefs" | "about";

const TABS: { id: TabId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "signals", label: "Signal Board" },
  { id: "beliefs", label: "Belief Network" },
  { id: "about", label: "About / Provenance" },
];

export function Shell({
  active,
  onNavigate,
  children,
}: {
  active: TabId;
  onNavigate: (t: TabId) => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#07070c] text-slate-100">
      <div
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60rem 30rem at 15% -10%, rgba(99,102,241,0.18), transparent), radial-gradient(50rem 25rem at 110% 10%, rgba(168,85,247,0.14), transparent)",
        }}
      />
      <header className="relative z-10 border-b border-white/10 bg-black/30 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold shadow-lg shadow-indigo-900/40">
              Λ
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-white">
                LeadOS <span className="text-indigo-300">pt-S</span>
              </div>
              <div className="text-[11px] text-slate-500">Bayesian Belief Network — Part 1</div>
            </div>
          </div>
          <nav className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => onNavigate(t.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  active === t.id
                    ? "bg-indigo-500 text-white shadow shadow-indigo-900/40"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-6xl px-5 py-8">{children}</main>
      <footer className="relative z-10 mx-auto max-w-6xl px-5 pb-10 text-center text-[11px] text-slate-600">
        Synthetic demo data only. Every probability shown is an estimate — see About / Provenance for sourcing and disclosed gaps.
      </footer>
    </div>
  );
}
