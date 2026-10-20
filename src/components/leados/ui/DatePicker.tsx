"use client";

import { useId } from "react";
import { cx } from "./cx";
import { CONTROL_BASE, controlBorder } from "./FieldShell";

export interface DateRange {
  start: string | null; // ISO yyyy-mm-dd
  end: string | null;
}

export interface DateRangePickerProps {
  label?: string;
  value: DateRange;
  onChange: (range: DateRange) => void;
  presets?: { label: string; range: DateRange }[];
}

/** Range picker built on two native <input type="date"> fields rather than
 * a bespoke calendar grid: full keyboard support, locale-aware formatting,
 * and screen-reader semantics come from the platform, which is more
 * reliable than a hand-rolled ARIA grid for a v1. Presets cover the
 * one-click cases; the native inputs cover arbitrary ranges. */
export function DateRangePicker({ label, value, onChange, presets }: DateRangePickerProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      {label && <span className="text-[var(--text-sm)] font-medium text-[var(--text-secondary)]">{label}</span>}
      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        <label htmlFor={`${id}-start`} className="sr-only">
          Start date
        </label>
        <input
          id={`${id}-start`}
          type="date"
          value={value.start ?? ""}
          max={value.end ?? undefined}
          onChange={(e) => onChange({ ...value, start: e.target.value || null })}
          className={cx(CONTROL_BASE, controlBorder(false), "h-[var(--control-height-md)] w-auto px-[var(--space-3)] text-[var(--text-sm)]")}
        />
        <span aria-hidden className="text-[var(--text-muted)]">
          →
        </span>
        <label htmlFor={`${id}-end`} className="sr-only">
          End date
        </label>
        <input
          id={`${id}-end`}
          type="date"
          value={value.end ?? ""}
          min={value.start ?? undefined}
          onChange={(e) => onChange({ ...value, end: e.target.value || null })}
          className={cx(CONTROL_BASE, controlBorder(false), "h-[var(--control-height-md)] w-auto px-[var(--space-3)] text-[var(--text-sm)]")}
        />
        {presets && (
          <div className="flex gap-[var(--space-1)]" role="group" aria-label="Date presets">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange(p.range)}
                className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-[var(--space-2)] py-1 text-[var(--text-xs)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
