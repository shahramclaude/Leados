"use client";

// ---------------------------------------------------------------------------
// ≤ 7 primary nav items (Hick–Hyman law: fewer top-level choices → faster
// decisions). Contextual actions live in each route, not in global nav.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TopBar } from "./TopBar";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", key: "D" },
  { href: "/objectives", label: "Objectives", key: "O" },
  { href: "/approvals", label: "Approvals", key: "A" },
  { href: "/scenarios", label: "Scenarios", key: "S" },
  { href: "/audit", label: "Audit", key: "U" },
  { href: "/settings", label: "Settings", key: "," },
];

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <div className="flex">
        <nav
          aria-label="Primary"
          className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex"
        >
          <Link href="/dashboard" className="mb-6 px-2 text-lg font-semibold tracking-tight text-slate-900">
            LEADOS
          </Link>
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${
                      active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-auto px-2 text-xs text-slate-400">
            Press <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono">?</kbd> for shortcuts
          </div>
        </nav>

        <div className="flex min-h-screen flex-1 flex-col">
          <TopBar />
          <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
