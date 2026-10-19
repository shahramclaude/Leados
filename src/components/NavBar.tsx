"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ROUTE_SECTIONS } from "@/app/routes";
import { cn } from "@/components/leados/ui/utils";
import { IconButton } from "@/components/leados/ui/Primitives";
import { useTheme } from "@/components/leados/ui/theme";

export function NavBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const { resolved, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <nav aria-label="Primary" className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5">
      <Link href="/now" className="flex items-center gap-2 px-2 text-h4 font-semibold tracking-tight text-text-primary">
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-sm text-on-accent">
          L
        </span>
        LEADOS
      </Link>

      <button
        type="button"
        onClick={onOpenPalette}
        className="mx-2 flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left text-body-sm text-text-tertiary transition-colors hover:border-border-strong"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true">🔎</span>
          Search or jump to…
        </span>
        <kbd className="rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[0.65rem] text-text-tertiary">
          ⌘K
        </kbd>
      </button>

      {ROUTE_SECTIONS.map((section) => (
        <div key={section.key}>
          <p className="px-2 text-caption font-semibold uppercase tracking-wider text-text-disabled">{section.label}</p>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {section.routes.map((route) => {
              const active = pathname === route.href || pathname?.startsWith(`${route.href}/`);
              return (
                <li key={route.key}>
                  <Link
                    href={route.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm font-medium transition-colors",
                      "duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                      active ? "bg-accent-subtle text-accent-subtle-text" : "text-text-secondary hover:bg-surface-raised hover:text-text-primary",
                    )}
                  >
                    <span aria-hidden="true">{route.icon}</span>
                    {route.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="mt-auto flex items-center justify-between px-2">
        <Link href="/styleguide" className="text-caption text-text-tertiary hover:text-text-primary hover:underline">
          Styleguide
        </Link>
        <IconButton label={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`} onClick={toggle}>
          <span aria-hidden="true">{resolved === "dark" ? "☀️" : "🌙"}</span>
        </IconButton>
      </div>
    </nav>
  );

  return (
    <>
      <div className="hidden w-64 shrink-0 border-r border-border-subtle bg-surface-sunken md:block">{nav}</div>
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-sunken px-3 py-2.5 md:hidden">
        <Link href="/now" className="text-body font-semibold text-text-primary">
          LEADOS
        </Link>
        <IconButton label={mobileOpen ? "Close navigation" : "Open navigation"} active={mobileOpen} onClick={() => setMobileOpen((o) => !o)}>
          <span aria-hidden="true">{mobileOpen ? "✕" : "☰"}</span>
        </IconButton>
      </div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 bg-surface-sunken md:hidden">{nav}</div>
      ) : null}
    </>
  );
}
