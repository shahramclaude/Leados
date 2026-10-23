import Link from "next/link";
import type { ReactNode } from "react";

const TABS = [
  { href: "/org-design", label: "Overview" },
  { href: "/org-design/lab", label: "Org Design Lab" },
  { href: "/org-design/ledger", label: "Human-Impact Ledger" },
  { href: "/org-design/scenarios", label: "Scenario Comparison" },
  { href: "/org-design/deals", label: "Deal Room" },
  { href: "/org-design/postmortem", label: "Post-Mortem Bridge" },
];

export default function OrgDesignLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <p className="m-0 text-xs uppercase tracking-[0.1em] text-slate-500">LEADOS — Part 54</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-950">Org Design Lab &amp; M&amp;A Deal Room</h1>
          <nav className="mt-4 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-500 hover:bg-white"
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
