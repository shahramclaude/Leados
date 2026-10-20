"use client";

import { useId, useState, type ReactNode } from "react";
import { cx } from "../ui/cx";

export interface ChartFrameProps {
  title: string;
  description?: string;
  legend?: { label: string; color: string; shape?: string }[];
  children: ReactNode;
  /** Accessible alternative required by the design system: every chart can
   * be viewed as a data table instead. */
  table: ReactNode;
  footnote?: string;
}

/** Common chrome for every chart: title, optional legend (color + shape,
 * never color alone), a "view as table" toggle, and a footnote slot for
 * documenting empty/zero-state or axis-truncation caveats. */
export function ChartFrame({ title, description, legend, children, table, footnote }: ChartFrameProps) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();

  return (
    <figure className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-[var(--card-padding)]">
      <div className="flex flex-wrap items-start justify-between gap-[var(--space-2)]">
        <div>
          <h3 className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)]">{title}</h3>
          {description && <p className="text-[var(--text-xs)] text-[var(--text-muted)]">{description}</p>}
        </div>
        <button
          type="button"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
          className="rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-[var(--space-2)] py-1 text-[var(--text-xs)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {asTable ? "View as chart" : "View as table"}
        </button>
      </div>
      {legend && legend.length > 0 && (
        <ul className="flex flex-wrap gap-[var(--space-3)]" aria-label="Legend">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-[var(--space-1)] text-[var(--text-xs)] text-[var(--text-secondary)]">
              <span aria-hidden style={{ color: l.color }}>
                {l.shape ?? "●"}
              </span>
              {l.label}
            </li>
          ))}
        </ul>
      )}
      <div id={`${id}-content`}>{asTable ? table : children}</div>
      {footnote && <figcaption className="text-[var(--text-xs)] text-[var(--text-muted)]">{footnote}</figcaption>}
    </figure>
  );
}

export function chartTableClassName() {
  return cx("w-full border-collapse text-[var(--text-xs)]");
}
