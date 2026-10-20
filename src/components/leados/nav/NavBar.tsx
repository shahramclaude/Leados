"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES, TIER_META, type RouteTier } from "@/app/routes";
import { useChrome } from "@/components/leados/app/GlobalChrome";
import { useTheme } from "@/components/leados/ui/ThemeProvider";
import { DENSITIES, THEMES } from "@/components/leados/ui/tokens";

const TIERS: RouteTier[] = ["now", "understand", "act"];

export function NavBar() {
  const pathname = usePathname();
  const { theme, density, setTheme, setDensity } = useTheme();
  const { openPalette, openShortcuts } = useChrome();

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface-raised/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-[var(--comp-page-gutter)] py-3">
        <Link href="/leados/now" className="text-sm font-semibold tracking-tight text-text-primary">
          LEADOS
        </Link>
        <nav aria-label="Primary" className="flex flex-1 items-center gap-1">
          {TIERS.map((tier) => {
            const route = ROUTES.find((r) => r.tier === tier && r.id === tier);
            if (!route) return null;
            const active = pathname.startsWith(route.href);
            return (
              <Link
                key={route.id}
                href={route.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
                  active ? "bg-accent-subtle text-accent-default" : "text-text-secondary hover:text-text-primary",
                ].join(" ")}
                title={TIER_META[tier].description}
              >
                {TIER_META[tier].label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={openPalette}
          className="hidden items-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle px-3 py-1.5 text-xs text-text-muted hover:border-border-strong sm:flex"
        >
          Search &amp; commands
          <kbd className="rounded border border-border-subtle bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>
        <button
          type="button"
          onClick={openShortcuts}
          aria-label="Keyboard shortcuts"
          className="rounded-[var(--radius-sm)] border border-border-subtle px-2 py-1.5 font-mono text-xs text-text-muted hover:border-border-strong"
        >
          ?
        </button>
        <label className="hidden items-center gap-1 text-xs text-text-muted md:flex">
          <span className="sr-only">Theme</span>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as typeof theme)}
            className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-base px-2 py-1 text-xs text-text-primary"
          >
            {THEMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="hidden items-center gap-1 text-xs text-text-muted md:flex">
          <span className="sr-only">Density</span>
          <select
            value={density}
            onChange={(e) => setDensity(e.target.value as typeof density)}
            className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-base px-2 py-1 text-xs text-text-primary"
          >
            {DENSITIES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
