"use client";

import { useId, useState, type ReactNode } from "react";

export interface ChartTableColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

export interface ChartFrameProps {
  title: string;
  description?: string;
  children: ReactNode;
  tableColumns: ChartTableColumn[];
  tableRows: Array<Record<string, string | number>>;
  sourceNote?: string;
}

/**
 * Every chart in LEADOS is wrapped in a ChartFrame so it ships with a
 * same-information "view as table" fallback — the accessible alternative
 * required by the chart grammar (Part 02-E).
 */
export function ChartFrame({ title, description, children, tableColumns, tableRows, sourceNote }: ChartFrameProps) {
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-[var(--comp-card-radius)] border border-border-subtle bg-surface-raised p-[var(--comp-card-padding)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id={titleId} className="text-sm font-semibold text-text-primary">
            {title}
          </h3>
          {description ? <p className="mt-0.5 max-w-[60ch] text-xs text-text-secondary">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="shrink-0 rounded-[var(--radius-sm)] border border-border-subtle px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-sunken"
        >
          {asTable ? "View as chart" : "View as table"}
        </button>
      </div>

      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{title} — tabular data</caption>
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-text-muted">
                {tableColumns.map((col) => (
                  <th key={col.key} scope="col" className="py-2 pr-4 font-medium">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, i) => (
                <tr key={i} className="border-b border-border-subtle last:border-b-0">
                  {tableColumns.map((col) => (
                    <td key={col.key} className={["py-2 pr-4 text-text-primary", col.numeric ? "font-mono tabular-nums" : ""].join(" ")}>
                      {row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
      {sourceNote ? <p className="text-[11px] text-text-muted">{sourceNote}</p> : null}
    </section>
  );
}
