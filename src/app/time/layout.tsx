import type { ReactNode } from "react";
import Link from "next/link";
import { ActorProvider } from "./ActorContext";
import { ActorSwitcher } from "./ActorSwitcher";

export const metadata = {
  title: "LEADOS — Time & Meeting Economics",
};

const NAV = [
  { href: "/time", label: "Dashboard" },
  { href: "/time/meeting-auditor", label: "Meeting Auditor" },
  { href: "/time/deep-work", label: "Deep-Work Architecture" },
  { href: "/time/strategy-mirror", label: "Strategy-Time Mirror" },
  { href: "/time/optimizer", label: "Calendar Optimizer" },
  { href: "/time/privacy", label: "Privacy" },
];

export default function TimeEconomicsLayout({ children }: { children: ReactNode }) {
  return (
    <ActorProvider>
      <div className="min-h-screen bg-slate-100">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="m-0 text-xs uppercase tracking-[0.12em] text-slate-500">LEADOS · Part 45</p>
              <h1 className="m-0 text-xl font-semibold text-slate-950">Time &amp; Meeting Economics</h1>
            </div>
            <ActorSwitcher />
          </div>
          <nav className="mx-auto flex max-w-6xl flex-wrap gap-1 px-6 pb-3">
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
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </ActorProvider>
  );
}
