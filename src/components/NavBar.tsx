"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/app/routes";
import { CommandPalette } from "./CommandPalette";

export function NavBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <span className="shrink-0 text-sm font-semibold tracking-wide text-indigo-400">LEADOS</span>
        <nav className="flex flex-1 flex-wrap gap-1 overflow-x-auto">
          {ROUTES.map((r) => {
            const active = pathname === r.path;
            return (
              <Link
                key={r.path}
                href={r.path}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {r.label}
              </Link>
            );
          })}
        </nav>
        <CommandPalette />
      </div>
    </header>
  );
}
