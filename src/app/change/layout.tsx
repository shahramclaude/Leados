import Link from "next/link";
import type { ReactNode } from "react";
import { SeedButton } from "./_components/SeedButton";

const NAV = [
  { href: "/change", label: "Transformation Dashboard" },
  { href: "/change/readiness", label: "Group Readiness" },
  { href: "/change/interventions", label: "Intervention Lab" },
  { href: "/change/saturation", label: "Saturation Alerts" },
];

export default function ChangeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="m-0 text-xs uppercase tracking-[0.1em] text-slate-500">LEADOS · Part 26</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-950">Transformation &amp; Change Systems</h1>
          </div>
          <SeedButton />
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-2 px-6 pb-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
