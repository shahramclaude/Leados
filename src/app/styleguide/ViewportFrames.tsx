"use client";

import { primaryNav } from "@/lib/nav";
import { MetricTile } from "@/components/insight/MetricTile";

const WIDTHS = [
  { id: "360", px: 360, label: "360px (small mobile)" },
  { id: "1440", px: 1440, label: "1440px (desktop)" },
] as const;

const THEMES = ["light", "dark"] as const;

function MiniShell() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2">
        <span className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)]">LEADOS</span>
        <nav aria-label="Primary (preview)">
          <ul className="flex flex-wrap gap-1">
            {primaryNav.slice(0, 4).map((item) => (
              <li key={item.id} className="rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[var(--text-xs)] text-[var(--text-secondary)]">
                {item.label}
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <div className="flex flex-1 flex-wrap gap-2 bg-[var(--surface-0)] p-3">
        <MetricTile label="NRR" value="112.4%" comparison={{ value: 0.038, label: "QoQ" }} trend={[98, 103, 107, 112]} />
        <MetricTile label="Runway" value="17.2 mo" comparison={{ value: -0.05, label: "QoQ" }} trend={[21, 19, 18, 17.2]} />
      </div>
    </div>
  );
}

/**
 * ViewportFrames — explicit pixel-locked renders of the app shell composite
 * at 360px and 1440px, in light and dark, to satisfy the "every primitive at
 * both breakpoints" checklist for the *layout-sensitive* composite (nav +
 * metric grid wrap/reflow). See docs/DESIGN-SYSTEM.md §6 and the Phase 5
 * self-review for why individual atoms (Button, Badge, …) are instead
 * verified responsively rather than re-rendered at fixed pixel widths — the
 * atoms have no internal breakpoints, only the composite layout does.
 */
export function ViewportFrames() {
  return (
    <div className="flex flex-col gap-6">
      {WIDTHS.map((width) => (
        <div key={width.id}>
          <p className="mb-2 text-[var(--text-sm)] font-semibold text-[var(--text-secondary)]">{width.label}</p>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {THEMES.map((theme) => (
              <div
                key={theme}
                data-theme={theme === "light" ? undefined : theme}
                style={{ width: width.px }}
                className="h-56 shrink-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] shadow-[var(--elevation-2)]"
              >
                <MiniShell />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
