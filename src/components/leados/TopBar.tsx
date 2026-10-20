"use client";

import Link from "next/link";
import { useTheme } from "@/components/leados/ui/ThemeProvider";
import { Select } from "@/components/leados/ui/Select";

export function TopBar() {
  const { preference, setPreference, density, setDensity } = useTheme();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-[var(--space-4)] border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-[var(--space-5)]">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        className="flex h-9 w-72 items-center gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-[var(--space-3)] text-[var(--text-xs)] text-[var(--text-muted)] hover:border-[var(--border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <span aria-hidden>⌘K</span>
        Search routes, people, decisions…
      </button>
      <div className="flex items-center gap-[var(--space-3)]">
        <div className="w-32">
          <Select
            aria-label="Theme"
            size="sm"
            value={preference}
            onChange={(e) => setPreference(e.target.value as never)}
            options={[
              { value: "system", label: "System theme" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "hc", label: "High contrast" },
            ]}
          />
        </div>
        <div className="w-36">
          <Select
            aria-label="Density"
            size="sm"
            value={density}
            onChange={(e) => setDensity(e.target.value as never)}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </div>
        <Link
          href="/styleguide"
          className="rounded-[var(--radius-md)] border border-[var(--border-strong)] px-[var(--space-3)] py-1.5 text-[var(--text-xs)] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          Styleguide
        </Link>
      </div>
    </header>
  );
}
