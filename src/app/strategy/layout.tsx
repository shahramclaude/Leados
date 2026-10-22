import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  { href: "/strategy", label: "Overview" },
  { href: "/strategy/map", label: "Strategy Map" },
  { href: "/strategy/execution", label: "Execution Board" },
  { href: "/strategy/drift", label: "Drift Radar" },
  { href: "/strategy/review", label: "Review Cadence" },
];

export default function StrategyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <span className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
            LEADOS · Strategy Systems
          </span>
          <nav className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
