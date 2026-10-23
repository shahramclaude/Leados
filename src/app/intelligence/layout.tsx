import Link from "next/link";
import type { ReactNode } from "react";

const TABS = [
  { href: "/intelligence/industry", label: "Industry Lens" },
  { href: "/intelligence/contagion", label: "Contagion Map" },
  { href: "/intelligence/benchmark", label: "Benchmark View" },
  { href: "/intelligence/radar", label: "External Radar" },
];

export default function IntelligenceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white px-6 py-5">
        <p className="m-0 text-xs uppercase tracking-[0.08em] text-slate-500">LEADOS · Part 50</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Industry Intelligence</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Market structure, contagion simulation, benchmarking, and external early-warning — every external
          figure below carries a source + evidence-class chip. Contagion and benchmark outputs are explicitly
          labeled as model estimates with intervals, never presented as fact.
        </p>
        <nav className="mt-4 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
