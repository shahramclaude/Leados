import Link from "next/link";
import type { ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";

const MODULES = [
  { href: "/", label: "Today", icon: "🏠" },
  { href: "/decide", label: "Decide", icon: "🎯" },
  { href: "/plan", label: "Plan", icon: "📈" },
  { href: "/approvals", label: "Approvals", icon: "✅" },
  { href: "/knowledge", label: "Knowledge", icon: "📚" },
  { href: "/audit", label: "Audit", icon: "🔒" },
];

export function Chrome({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--surface-page)]">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-6 border-b border-[var(--border-default)] bg-[var(--surface-card)] px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] bg-[var(--brand-600)] text-[14px] font-bold text-white">
            L
          </span>
          <span className="text-[16px] font-semibold text-[var(--text-primary)]">LEADOS</span>
        </div>
        <CommandPalette />
        <div className="flex items-center gap-3 text-[13px] text-[var(--text-secondary)]">
          <span className="hidden sm:inline">Northwind Holdings</span>
          <span className="grid h-8 w-8 place-items-center rounded-[var(--radius-full)] bg-[var(--brand-100)] text-[13px] font-semibold text-[var(--brand-700)]">
            AK
          </span>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1440px]">
        <nav
          aria-label="Modules"
          className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-56 shrink-0 flex-col gap-1 border-r border-[var(--border-default)] px-3 py-5 md:flex"
        >
          {MODULES.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-[14px] font-medium text-[var(--text-secondary)] hover:bg-[var(--n-100)] hover:text-[var(--text-primary)]"
            >
              <span aria-hidden>{m.icon}</span>
              {m.label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1 px-6 py-8 md:px-10">{children}</main>
      </div>
    </div>
  );
}
