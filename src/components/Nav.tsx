"use client";

import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import CommandPalette from "./CommandPalette";
import { ROUTES } from "@/lib/client-session";

export default function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Link href="/" className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-900 dark:text-slate-100">
          LEADOS
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap gap-1 text-sm">
          {ROUTES.filter((r) => r.href !== "/").map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="rounded-full px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {r.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <CommandPalette />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
