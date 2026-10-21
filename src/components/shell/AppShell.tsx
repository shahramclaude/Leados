"use client";

import Link from "next/link";
import { useMemo } from "react";
import { primaryNav, secondaryNav, PRIMARY_NAV_LIMIT } from "@/lib/nav";
import { assertHickHymanLimit } from "@/lib/a11y";
import { ThemeToggle } from "./ThemeToggle";
import { CommandPalette, type CommandItem } from "@/components/command/CommandPalette";
import { ToastProvider } from "@/components/ui/Toast";

export function AppShell({ children }: { children: React.ReactNode }) {
  assertHickHymanLimit(primaryNav.length, "primaryNav", PRIMARY_NAV_LIMIT);

  const commandItems: CommandItem[] = useMemo(
    () => [
      ...primaryNav.map((item) => ({
        id: item.id,
        label: item.label,
        group: "Go to",
        shortcut: item.shortcut,
        keywords: [item.description],
        onSelect: () => {
          window.location.href = item.href;
        },
      })),
      ...secondaryNav.map((item) => ({
        id: item.id,
        label: item.label,
        group: "More",
        keywords: [item.description],
        onSelect: () => {
          window.location.href = item.href;
        },
      })),
    ],
    [],
  );

  return (
    <ToastProvider>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5">
          <div className="flex items-center gap-6">
            <span className="text-[var(--text-md)] font-semibold tracking-tight text-[var(--text-primary)]">LEADOS</span>
            <nav aria-label="Primary">
              <ul className="flex items-center gap-1">
                {primaryNav.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="rounded-[var(--radius-md)] px-2.5 py-1.5 text-[var(--text-sm)] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              className="hidden items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[var(--text-sm)] text-[var(--text-muted)] sm:flex"
            >
              Search… <kbd className="text-[var(--text-xs)]">⌘K</kbd>
            </button>
            <ThemeToggle />
          </div>
        </header>
        <main id="main-content" className="flex-1">
          {children}
        </main>
      </div>
      <CommandPalette items={commandItems} />
    </ToastProvider>
  );
}
