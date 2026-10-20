import type { ReactNode } from "react";
import { cx } from "./cx";
import { CountUp } from "./CountUp";

export interface StatTileProps {
  label: string;
  value: number;
  formatter?: (n: number) => string;
  delta?: { value: number; direction: "up" | "down" | "flat"; isGood?: boolean };
  sparkline?: ReactNode;
  unit?: string;
}

const DIRECTION_GLYPH: Record<NonNullable<StatTileProps["delta"]>["direction"], string> = {
  up: "▲",
  down: "▼",
  flat: "▬",
};

export function StatTile({ label, value, formatter, delta, sparkline, unit }: StatTileProps) {
  const deltaGood = delta ? (delta.isGood ?? delta.direction !== "down") : true;
  return (
    <div className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-[var(--card-padding)]">
      <p className="text-[var(--text-xs)] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">{label}</p>
      <div className="flex items-baseline gap-[var(--space-1)]">
        <span className="text-[var(--text-2xl)] font-semibold text-[var(--text-primary)]">
          <CountUp value={value} formatter={formatter} />
        </span>
        {unit && <span className="text-[var(--text-sm)] text-[var(--text-muted)]">{unit}</span>}
      </div>
      <div className="flex items-center justify-between gap-[var(--space-2)]">
        {delta && (
          <span
            className={cx(
              "inline-flex items-center gap-1 text-[var(--text-xs)] font-medium",
              deltaGood ? "text-[var(--status-success)]" : "text-[var(--status-danger)]",
            )}
          >
            <span aria-hidden>{DIRECTION_GLYPH[delta.direction]}</span>
            {Math.abs(delta.value).toFixed(1)}%
            <span className="sr-only">{delta.direction === "up" ? "increase" : delta.direction === "down" ? "decrease" : "no change"}</span>
          </span>
        )}
        {sparkline && <div className="ml-auto">{sparkline}</div>}
      </div>
    </div>
  );
}
