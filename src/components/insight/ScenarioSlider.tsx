"use client";

import { useId, useState } from "react";
import { formatDelta, formatNumber } from "@/lib/format";
import { announce } from "@/lib/a11y";
import { cn } from "@/lib/cn";

export interface ScenarioSliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  baseline: number;
  unit?: string;
  /** Pure function from slider value -> derived outcome, used for the live
   * delta preview. Must be cheap (called on every input event). */
  project: (value: number) => number;
  outcomeLabel: string;
  className?: string;
}

/**
 * ScenarioSlider — drag the lever, see the delta preview update live.
 * Contract:
 *  - `<input type="range">` under the hood (free keyboard support: arrows,
 *    Home/End, Page Up/Down).
 *  - The live delta is both visual (number + color) AND announced via a
 *    polite live region, debounced to avoid a screen-reader flood while
 *    dragging.
 *  - Baseline is always shown as a fixed reference mark on the track.
 */
export function ScenarioSlider({ label, min, max, step = 1, defaultValue, baseline, unit = "", project, outcomeLabel, className }: ScenarioSliderProps) {
  const [value, setValue] = useState(defaultValue);
  const id = useId();
  const baselineOutcome = project(baseline);
  const outcome = project(value);
  const delta = outcome - baselineOutcome;
  const baselinePct = ((baseline - min) / (max - min)) * 100;

  let announceTimer: number | undefined;
  function onInput(next: number) {
    setValue(next);
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      announce(`${label} set to ${formatNumber(next)}${unit}. ${outcomeLabel} ${formatDelta(project(next) - baselineOutcome, { percent: false })}.`);
    }, 400);
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[var(--text-sm)] font-medium text-[var(--text-secondary)]">
          {label}
        </label>
        <span data-metric className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)]">
          {formatNumber(value)}
          {unit}
        </span>
      </div>

      <div className="relative py-2">
        <span
          aria-hidden
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-[var(--border-strong)]"
          style={{ left: `${baselinePct}%` }}
          title={`Baseline: ${formatNumber(baseline)}${unit}`}
        />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onInput(Number(e.target.value))}
          className="w-full accent-[var(--domain-strategy-solid)]"
          aria-describedby={`${id}-delta`}
        />
      </div>

      <p id={`${id}-delta`} data-metric className="text-[var(--text-sm)] font-medium" style={{ color: delta >= 0 ? "var(--success-ink)" : "var(--danger-ink)" }}>
        {outcomeLabel}: {formatNumber(outcome)} ({formatDelta(delta, { percent: false })} vs baseline {formatNumber(baselineOutcome)})
      </p>
    </div>
  );
}
