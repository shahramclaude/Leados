import type { ReactNode } from "react";
import Link from "next/link";

const NAV = [
  { href: "/fitness", label: "Fitness Dashboard" },
  { href: "/fitness/goodhart", label: "Goodhart Watch" },
  { href: "/fitness/evolution", label: "Evolution Loops" },
  { href: "/fitness/policy", label: "Weight Policy" },
  { href: "/fitness/legacy", label: "Legacy Audit" },
];

export default function FitnessLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">LEADOS · Part 39</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Organizational Fitness &amp; Evolution Engine</h1>
          <nav className="mt-4 flex flex-wrap gap-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
